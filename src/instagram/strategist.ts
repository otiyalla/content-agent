import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { env } from '../config/env';
import { backupSteps, runChain } from '../services/llm-providers';
import { ZENLOT_PRODUCT } from '../config/zenlot';
import { screensForPrompt } from './screens';
import { WeekPlanSchema, type WeekPlan, type CalendarPost } from './types';
import type { Slot } from './calendar';

// ---------------------------------------------------------------------------
// The Instagram strategist: plans a full week of posts in one structured call.
//
// Model: Claude Opus 5.5 with schema-constrained output, so the result always
// matches WeekPlanSchema. Server-side refusal fallback is enabled — if Opus
// declines (e.g. a false-positive safety classifier on trading content), the
// API retries on a fallback model within the same call. If the Anthropic API
// itself is unavailable, OpenAI and then xAI Grok take over; their JSON is
// validated against the same schema.
// ---------------------------------------------------------------------------

const MODEL = 'claude-opus-5-5';
const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const BRAND_BRIEF = `
# Zenlot
${ZENLOT_PRODUCT}

# Audience
Retail forex traders, mostly 20-40, beginner to intermediate. Many have blown at
least one account. They are drowning in strategy content and signals; what they
lack is risk discipline and self-awareness. They follow accounts that make them
feel smarter and more in control, not ones that sell to them.

# Voice
Calm, sharp, numerate. A seasoned risk manager who respects the reader. Short
sentences. Concrete numbers. Zero hype, zero "lambo" culture, zero emojis spam
(at most one or two purposeful emojis per caption). Never preachy.

# Hard rules
- Education only. Never give trade signals, price predictions, or tell people what to buy/sell.
- Never promise or imply guaranteed returns.
- Every number must be arithmetically correct and either derived from maths you can show
  (e.g. drawdown recovery = 1/(1-loss) - 1) or framed as an illustrative example.
  Do NOT invent research statistics ("90% of traders...") unless widely documented, and
  if used, phrase cautiously ("most retail CFD accounts lose money" style).
- Every caption ends with the line: "Educational content, not financial advice."
- Mention Zenlot by name in at most ONE post per week: either the "product" post or the "founder" post
  (never both in one week), and even
  then lead with the problem. Describe only features listed above, with the verbs it really
  does (recommends, warns, records, grades, flags) — never "enforces", "auto-sizes your orders" or "places trades". Other posts may end with a soft "link in bio" only on the cta slide.
`;

const FORMAT_GUIDE = `
# Formats
Each slot is either a "carousel" (3-8 slides) or a "single" (exactly 1 slide).

Slide layouts available (field usage):
- cover:    kicker (2-3 word category, e.g. "Risk math"), title (the hook, <= 10 words), body (one-line promise)
- point:    kicker (e.g. "01" or "Step 2"), title (<= 10 words), body (<= 35 words explaining it)
- stat:     stat (short number like "-30%" or "1.5R"), title (label, <= 8 words), body (<= 25 words)
- list:     kicker, title (<= 8 words), items (3-6 items, each <= 8 words)
- mythfact: kicker ("Myth vs fact"), title = the myth (<= 15 words), body = the fact (<= 30 words)
- quote:    kicker (category), title = a punchy original one-liner (<= 16 words), body = short framing (<= 6 words)
- question: kicker ("Your turn"), title = the question (<= 10 words), items = 2-4 answer options (<= 5 words each), body = optional nudge
- cta:      title (<= 8 words: save/share prompt), body (<= 25 words; may mention Zenlot softly + "link in bio")
- screen:   a REAL Zenlot app screenshot in a phone frame. kicker (1-2 words), title (<= 7 words), body (<= 14 words),
            screen = one of the screen ids below. All other fields empty. The top ~60% of the screenshot is visible.

Every slide must include the "screen" field: a screen id for layout "screen", otherwise "".

# Real app screens available (use ONLY in the weekly "product" post)
${screensForPrompt()}

Screen rules:
- The product post should use 2-3 "screen" slides (a founder post may use at most 1), preferring "hero" and "good" screens. Avoid "weak" screens.
- A screen slide's title/body must describe what that screen visibly shows. Never claim something the screen doesn't show.
- Don't use the same screen twice in a week. Only product and founder posts may use screen slides.

Text highlighting: wrap 1-3 key words in **double asterisks** inside title/body to render them in the brand accent colour.
Use it on most slides, sparingly.

Carousel structure that performs:
  1. cover with a scroll-stopping hook (curiosity gap, contrarian claim, or painful truth)
  2. 2-6 value slides (point / stat / list / mythfact) — one idea per slide, building logically
  3. final cta slide

Singles should be the most saveable formats: list (checklists), mythfact, stat, quote, or question.
Use "question" at most once per week.

# Captions
- Line 1 is a hook under 125 characters (it's all people see before "more").
- 60-180 words total, short paragraphs separated by blank lines.
- Expand on the post; give one extra insight not on the slides.
- End with a call to action (save / share with a trading friend / comment) then the disclaimer line.
- No hashtags in the caption — they go in the hashtags field (3-5, specific, e.g. forextrading, riskmanagement,
  tradingpsychology, forexeducation, tradingjournal; avoid generic spam like #money #rich).
`;

export interface PlanningContext {
  weekLabel: string; // e.g. "2026-W48 (Mon 23 Nov – Sun 29 Nov)"
  slots: Slot[];
  recentPosts: CalendarPost[]; // previous weeks, for de-duplication and learning
  notes?: string; // optional steer from a human, e.g. "focus on NFP week"
}

function performanceSummary(posts: CalendarPost[]): string {
  const published = posts.filter((p) => p.status === 'published');
  if (published.length === 0) return 'No published posts yet — this is a fresh account. Optimise for saves and shares.';

  const scored = published
    .map((p) => {
      const i = p.insights;
      const reach = i?.reach ?? 0;
      // Saves and shares are the strongest ranking signals on Instagram.
      const engagement = (i?.saved ?? 0) * 3 + (i?.shares ?? 0) * 3 + (i?.comments ?? 0) * 2 + (i?.likes ?? 0);
      return { p, reach, engagement, rate: reach > 0 ? engagement / reach : 0 };
    })
    .sort((a, b) => b.rate - a.rate);

  const line = ({ p, reach, rate }: (typeof scored)[number]) =>
    `- [${p.pillar}, ${p.slides.length > 1 ? 'carousel' : p.slides[0]?.layout}] "${p.slides[0]?.title}" — reach ${reach}, saves ${p.insights?.saved ?? '?'}, shares ${p.insights?.shares ?? '?'}, weighted engagement rate ${(rate * 100).toFixed(1)}%`;

  return [
    `Published posts with metrics: ${published.length}.`,
    'Best performers:',
    ...scored.slice(0, 3).map(line),
    'Weakest performers:',
    ...scored.slice(-3).reverse().map(line),
  ].join('\n');
}

function buildPrompt(ctx: PlanningContext): string {
  const slotLines = ctx.slots.map((s, i) => `  slot ${i}: ${s.day.toUpperCase()} ${s.hourUtc}:00 UTC — ${s.format}`).join('\n');
  const recentTitles = ctx.recentPosts.map((p) => `- (${p.pillar}) ${p.topic}`).join('\n') || '- none yet';

  return `You are Zenlot's Instagram strategist and content lead. Plan next week's Instagram feed posts.
${BRAND_BRIEF}
${FORMAT_GUIDE}
# This week
Week: ${ctx.weekLabel}
Slots to fill (one post per slot, use each slot index exactly once):
${slotLines}

Pillar mix for the week: at least 2 posts on risk-math or process, at least 1 on psychology,
and exactly one Zenlot post: a "product" post OR a "founder" post. Alternate them: if the most recent
Zenlot post in the history below was "founder", make this week's "product", and vice versa (start with "founder"
if there's no history, so new followers meet the person behind the app). Vary the layouts so the grid
doesn't look repetitive.

# Founder posts
Written in the founder's own first-person voice ("I"), using ONLY the facts in the founder story above.
Good angles: the spreadsheet that kept evolving; noticing more errors when off-plan than on-plan; journaling
so you don't repeat a mistake; why he wanted to see the possible gain or loss before entering. Each founder
post tells ONE part of the story, so over the weeks the account tells the whole thing. Never invent scenes,
numbers, dates or outcomes. Never claim the founder is profitable or successful as a trader.
Give the week a coherent theme so the posts reinforce each other.
${ctx.notes ? `\nSteer from the team: ${ctx.notes}\n` : ''}
# Performance so far
${performanceSummary(ctx.recentPosts)}

Lean into what has worked; change approach on what hasn't. Reference this in each post's rationale.

# Already posted recently (do not repeat these angles)
${recentTitles}

Produce the week plan.`;
}

/** Validates structural rules the schema can't express, and repairs what it safely can. */
export function checkPlan(plan: WeekPlan, slots: Slot[]): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const post of plan.posts) {
    const slot = slots[post.slot];
    if (!slot) {
      problems.push(`post "${post.topic}" uses unknown slot ${post.slot}`);
      continue;
    }
    if (seen.has(post.slot)) problems.push(`slot ${post.slot} used twice`);
    seen.add(post.slot);
    if (slot.format === 'single' && post.slides.length !== 1) problems.push(`slot ${post.slot} is single but has ${post.slides.length} slides`);
    if (slot.format === 'carousel' && (post.slides.length < 3 || post.slides.length > 10))
      problems.push(`slot ${post.slot} carousel has ${post.slides.length} slides`);
    for (const slide of post.slides) {
      if (slide.layout === 'screen' && !slide.screen) problems.push(`slot ${post.slot} has a screen slide without a screen id`);
      if (slide.layout !== 'screen') slide.screen = '';
    }
    const screenSlides = post.slides.filter((sl) => sl.layout === 'screen').length;
    if (post.pillar !== 'product' && post.pillar !== 'founder' && screenSlides > 0)
      problems.push(`slot ${post.slot} uses app screens but is not the product or founder post`);
    if (post.pillar === 'founder' && screenSlides > 1) problems.push(`slot ${post.slot} founder post uses more than 1 screen`);
    if (!post.caption.includes('not financial advice')) {
      post.caption = `${post.caption.trim()}\n\nEducational content, not financial advice.`;
    }
    post.hashtags = post.hashtags.map((t) => t.replace(/^#/, '').replace(/\s+/g, '')).slice(0, 5);
  }
  for (let i = 0; i < slots.length; i++) if (!seen.has(i)) problems.push(`slot ${i} not filled`);
  const zenlotPosts = plan.posts.filter((p) => p.pillar === 'product' || p.pillar === 'founder').length;
  if (zenlotPosts > 1) problems.push(`${zenlotPosts} product/founder posts; the week must have at most one`);
  return problems;
}

async function planWithClaude(prompt: string): Promise<WeekPlan> {
  const response = await claude.beta.messages.parse({
    model: MODEL,
    max_tokens: 20000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: betaZodOutputFormat(WeekPlanSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined to plan the week (${response.stop_details?.category ?? 'unknown'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Week plan hit max_tokens');
  if (!response.parsed_output) throw new Error('Week plan did not parse');
  console.log(`[Strategist] planned by ${response.model} (in ${response.usage.input_tokens} / out ${response.usage.output_tokens} tokens)`);
  return response.parsed_output;
}

/** Backup path (OpenAI, then Grok): JSON mode + schema in the prompt, validated with zod. */
function backupPlanSteps(prompt: string) {
  const schema = JSON.stringify(z.toJSONSchema(WeekPlanSchema));
  const fullPrompt = `${prompt}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${schema}`;
  return backupSteps(fullPrompt, { maxTokens: 16000, tier: 'complex', json: true }).map((step) => ({
    name: step.name,
    run: async () => {
      const text = await step.run();
      const raw = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
      return WeekPlanSchema.parse(JSON.parse(raw));
    },
  }));
}

function plan(prompt: string): Promise<WeekPlan> {
  return runChain('planInstagramWeek', [{ name: 'anthropic', run: () => planWithClaude(prompt) }, ...backupPlanSteps(prompt)]);
}

export async function planWeek(ctx: PlanningContext): Promise<WeekPlan> {
  const prompt = buildPrompt(ctx);
  let result = await plan(prompt);

  const problems = checkPlan(result, ctx.slots);
  if (problems.length) {
    // One repair attempt: tell the model exactly what was wrong.
    console.warn(`[Strategist] plan issues: ${problems.join('; ')} — asking for a corrected plan`);
    result = await plan(`${prompt}\n\nYour previous plan had these problems, fix them:\n- ${problems.join('\n- ')}`);
    const remaining = checkPlan(result, ctx.slots);
    if (remaining.length) throw new Error(`Week plan still invalid: ${remaining.join('; ')}`);
  }
  return result;
}
