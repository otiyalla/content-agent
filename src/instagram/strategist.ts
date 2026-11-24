import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { env } from '../config/env';
import { backupSteps, runChain } from '../services/llm-providers';
import { ZENLOT_PRODUCT } from '../config/zenlot';
import { screensForPrompt } from './screens';
import { qaPost } from './qa';
import { WeekPlanSchema, type WeekPlan, type PlannedPost, type CalendarPost } from './types';
import { minFollowPosts } from './account';
import { ZENLOT_SERIES, type Slot } from './calendar';
import { seasonalNotes } from './seasonal';

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
Slide characters: the slide font only has basic Latin letters, digits and common punctuation. Write maths in plain
text ("0.6^5 = 7.8%", "about 1 in 13", "x", "/", "~"). No superscripts, ≈, arrows, ticks or emoji on slides.
Show your working: write each calculation as a plain equation ("3 / 7 = 42.9%", "$50 / (25 x $10) = 0.2 lots")
so it can be re-checked automatically. Slides with money amounts get an "Illustrative example" label automatically.

Carousel structure that performs:
  1. cover with a scroll-stopping hook (curiosity gap, contrarian claim, or painful truth)
  2. 2-6 value slides (point / stat / list / mythfact) — one idea per slide, building logically
  3. final cta slide

Singles should be the most saveable formats: list (checklists), mythfact, stat, quote, or question.
Use "question" at most once per week.

# Tags (used to learn what works; tag honestly)
- hookType: the kind of opening the cover and caption line 1 use (stat, myth, question, mistake, story, how-to, checklist, contrarian).
- ctaType: the main call to action (save, share, comment, follow, link).
- series: the recurring series name if the post belongs to one, else "".

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
  followers?: number; // current follower count; below FOLLOWER_GOAL the week must ask for follows
  weekStart?: Date; // Monday of the planned week, for seasonal moments
}

// Below this many posts measured at the same age, rankings are noise.
const MIN_MEASURED_POSTS = 10;

/**
 * What the planner learns from. Posts are compared only on their 48-hour
 * snapshot (same age for every post), and posts with zero reach are left out
 * as unreliable. Until enough posts are measured, the planner is told not to
 * draw conclusions at all.
 */
export function performanceSummary(posts: CalendarPost[]): string {
  const published = posts.filter((p) => p.status === 'published');
  if (published.length === 0) return 'No published posts yet — this is a fresh account. Follow the brief and the pillar mix.';

  const at48 = published.filter((p) => p.insightSnapshots?.['48h']);
  const measured = at48.filter((p) => (p.insightSnapshots!['48h']!.reach ?? 0) > 0);
  const zeroReach = at48.length - measured.length;
  const notYet = published.length - at48.length;

  // Growth first: follows per 1,000 reach. Weighted engagement (saves and shares count most) breaks ties.
  const scored = measured
    .map((p) => {
      const i = p.insightSnapshots!['48h']!;
      const reach = i.reach ?? 0;
      const engagement = (i.saved ?? 0) * 3 + (i.shares ?? 0) * 3 + (i.comments ?? 0) * 2 + (i.likes ?? 0);
      return { p, i, reach, followRate: ((i.follows ?? 0) / reach) * 1000, rate: engagement / reach };
    })
    .sort((a, b) => b.followRate - a.followRate || b.rate - a.rate);

  const line = ({ p, i, reach, followRate, rate }: (typeof scored)[number]) =>
    `- [${p.pillar}, ${p.slides.length > 1 ? 'carousel' : p.slides[0]?.layout}, ${p.id.split('-').pop()}, hook ${p.hookType ?? '?'}, cta ${p.ctaType ?? '?'}] "${(p.slides[0]?.title ?? '').replace(/\*\*/g, '')}" — at 48h: reach ${reach}, follows ${i.follows ?? 0} (${followRate.toFixed(1)} per 1k reach), profile visits ${i.profileVisits ?? 0}, link taps ${i.linkTaps ?? 0}, saves ${i.saved ?? 0}, shares ${i.shares ?? 0}, weighted engagement ${(rate * 100).toFixed(1)}%`;

  // Averages by tag, so the planner sees which hooks and CTAs grow the account.
  const byTag = (key: 'hookType' | 'ctaType') => {
    const groups = new Map<string, number[]>();
    for (const s of scored) {
      const tag = s.p[key] ?? 'untagged';
      groups.set(tag, [...(groups.get(tag) ?? []), s.followRate]);
    }
    return [...groups.entries()]
      .map(([tag, rates]) => ({ tag, n: rates.length, avg: rates.reduce((a, b) => a + b, 0) / rates.length }))
      .sort((a, b) => b.avg - a.avg)
      .map((g) => `${g.tag} ${g.avg.toFixed(1)}/1k (${g.n} post${g.n > 1 ? 's' : ''})`)
      .join(', ');
  };

  const counts = [
    `${published.length} published post(s); ${measured.length} measured at 48 hours`,
    notYet ? `${notYet} not yet measured (too new, or published before snapshots existed)` : '',
    zeroReach ? `${zeroReach} left out for zero reach` : '',
  ].filter(Boolean).join('; ');

  if (measured.length < MIN_MEASURED_POSTS) {
    return [
      `NOT ENOUGH DATA YET: ${counts}. About ${MIN_MEASURED_POSTS} posts measured at the same age are needed before comparing.`,
      'Do not infer what works or doesn\'t from these numbers, and don\'t cite them as evidence in rationales. Follow the brief and the pillar mix, and vary formats so future weeks can be compared.',
      ...(scored.length ? ['For reference only:', ...scored.map(line)] : []),
    ].join('\n');
  }

  return [
    `${counts}. All numbers below are at 48 hours after publishing, so posts are comparable. Posts are ranked by follows per 1,000 reach (growth), then by weighted engagement.`,
    'Best performers:',
    ...scored.slice(0, 3).map(line),
    'Weakest performers:',
    ...scored.slice(-3).reverse().map(line),
    `Follows per 1k reach by hook: ${byTag('hookType')}.`,
    `Follows per 1k reach by CTA: ${byTag('ctaType')}.`,
    'Groups with fewer than 3 posts are hints, not evidence.',
  ].join('\n');
}

function followRule(min: number): string {
  const how = 'A "follow" post names its series in the caption\'s ask ("Follow for more Survival Maths"), so people know what they get.';
  return min ? `The account is new, so at least ${min} posts use "follow". ${how}` : `"follow" is optional. ${how}`;
}

/**
 * An ask to follow the account that says what following gets you: "Follow for more <series>" or
 * "Follow @zenlot_app ... <series>". "Follow your Pre-Trade Check" is advice, not an ask.
 */
export function asksToFollow(text: string, series: string): boolean {
  const plain = (s: string) => s.replace(/\*\*/g, '').replace(/[’]/g, "'").toLowerCase();
  return plain(text)
    .split(/[.!?\n]/)
    .some((sentence) => {
      const ask = /\bfollow\s+(?:(?:us|along|zenlot)\s+)?(?:for\b|@zenlot_app\b)/.exec(sentence);
      return ask !== null && sentence.slice(ask.index).includes(plain(series));
    });
}

/** Adds the follow ask to a caption that lacks it, before the disclaimer. */
export function withFollowAsk(caption: string, series: string): string {
  if (asksToFollow(caption, series)) return caption;
  const ask = `Follow @zenlot_app for more ${series}.`;
  const lines = caption.trimEnd().split('\n');
  const at = lines.map((l) => /not financial advice/i.test(l)).lastIndexOf(true);
  if (at < 0) return `${lines.join('\n')}\n\n${ask}`;
  return [...lines.slice(0, at), ask, '', ...lines.slice(at)].join('\n');
}

function buildPrompt(ctx: PlanningContext): string {
  const slotLines = ctx.slots
    .map((s, i) => `  slot ${i}: ${s.day.toUpperCase()} ${s.hourUtc}:00 UTC — ${s.format} — series "${s.series}" — pillar ${s.pillars.join(' or ')}. ${s.brief}`)
    .join('\n');
  const season = ctx.weekStart ? seasonalNotes(ctx.weekStart) : '';
  const recentTitles = ctx.recentPosts.map((p) => `- (${p.pillar}) ${p.topic}`).join('\n') || '- none yet';

  return `You are Zenlot's Instagram strategist and content lead. Plan next week's Instagram feed posts.
${BRAND_BRIEF}
${FORMAT_GUIDE}
# This week
Week: ${ctx.weekLabel}
Slots to fill (one post per slot, use each slot index exactly once):
${slotLines}

Each slot is a recurring series with its own pillar (above). Use the slot's pillar.
The Wednesday slot is the week's only Zenlot post: "product" (series "${ZENLOT_SERIES.product}") OR "founder"
(series "${ZENLOT_SERIES.founder}"). Alternate them: if the most recent Zenlot post in the history below was
"founder", make this week's "product", and vice versa (start with "founder" if there's no history, so new
followers meet the person behind the app). No other post mentions Zenlot except a soft "link in bio" on a cta slide.
Vary the layouts so the grid doesn't look repetitive.

# Series rules
- The cover kicker (slide 1 kicker) is exactly the series name, so followers learn the series.
- Set the "series" field to the series name.
- The Saturday "Weekend Review" teaches reviewing and journaling: how to review a week, what to write after a
  trade, judging process over outcome, reading patterns in your own record. It's the account's journaling content.
- Exactly one post a week is a clearly hypothetical scenario ("Hypothetical: a trader risks 2% and..."), labelled
  as hypothetical on the slide. Never present it as a real person or a real result.

# Carousel slide 2
Instagram re-shows carousels to people who skipped them, starting from slide 2. Write slide 2 as a second hook
that makes sense on its own: a complete, striking statement or number, not a continuation of the cover.

# Calls to action
Rotate them. Across the week no ctaType is used more than twice. ${followRule(minFollowPosts(ctx.followers))}
Don't end every caption with "save this / share it with the friend who".

# Stand-alone posts
Any post can be skipped or published late, so never refer to another post ("as Monday's maths showed",
"yesterday's post", "earlier this week"). Repeat the key fact instead.

# Founder posts
Written in the founder's own first-person voice ("I"), using ONLY the facts in the founder story above.
Good angles: the spreadsheet that kept evolving; noticing more errors when off-plan than on-plan; journaling
so you don't repeat a mistake; why he wanted to see the possible gain or loss before entering. Each founder
post tells ONE part of the story, so over the weeks the account tells the whole thing. Never invent scenes,
numbers, dates or outcomes. Never claim the founder is profitable or successful as a trader.
Give the week a coherent theme so the posts reinforce each other.
${season ? `\n# Seasonal moment\n${season}\n` : ''}${ctx.notes ? `\nSteer from the team: ${ctx.notes}\n` : ''}
# Performance so far
${performanceSummary(ctx.recentPosts)}

If there is enough data, lean into what has worked and change approach on what hasn't, and reference it in each post's rationale. If it says there isn't enough data yet, don't draw conclusions from it.

# Already posted recently (do not repeat these angles)
${recentTitles}

Produce the week plan.`;
}

// "as Monday's maths showed", "yesterday's post", "earlier this week": breaks if that post was skipped or late.
const CROSS_DAY_REF =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)['’]s\s+(?:post|maths?|lesson|carousel|checklist|slide|numbers|example)|\byesterday['’]?s?\s+post|\bearlier this week\b|\b(?:last|previous|our last)\s+post\b/i;

export interface PlanCheck {
  /** Problems that must never be published, by position in plan.posts. Those posts are held, not the week. */
  blocking: Map<number, string[]>;
  /** Style and structure slips worth a retry and a note in the email, but never worth losing a post. */
  warnings: string[];
  /** Slots nothing fills. */
  missing: string[];
}

/**
 * Checks the rules the schema can't express, and repairs what it safely can. Brand, maths, advice and
 * anything that can't be drawn blocks that post; everything else is a warning.
 */
export async function checkPlan(plan: WeekPlan, slots: Slot[], minFollow = minFollowPosts(undefined)): Promise<PlanCheck> {
  const blocking = new Map<number, string[]>();
  const warnings: string[] = [];
  const seen = new Set<number>();
  for (const [at, post] of plan.posts.entries()) {
    const block = (why: string) => blocking.set(at, [...(blocking.get(at) ?? []), why]);
    const warn = (why: string) => warnings.push(`slot ${post.slot} ${why}`);
    const slot = slots[post.slot];
    if (!slot) {
      block(`post "${post.topic}" uses unknown slot ${post.slot}`);
      continue;
    }
    if (seen.has(post.slot)) block(`slot ${post.slot} used twice`);
    seen.add(post.slot);
    if (post.slides.length < 1 || post.slides.length > 10) block(`has ${post.slides.length} slides`);
    else if (slot.format === 'single' && post.slides.length !== 1) warn(`is single but has ${post.slides.length} slides`);
    else if (slot.format === 'carousel' && post.slides.length < 3) warn(`carousel has ${post.slides.length} slides`);
    for (const slide of post.slides) {
      if (slide.layout === 'screen' && !slide.screen) block('has a screen slide without a screen id');
      if (slide.layout !== 'screen') slide.screen = '';
    }
    const zenlotPost = post.pillar === 'product' || post.pillar === 'founder';
    const screenSlides = post.slides.filter((sl) => sl.layout === 'screen').length;
    if (!zenlotPost && screenSlides > 0) block('uses app screens but is not the product or founder post');
    if (post.pillar === 'founder' && screenSlides > 1) warn('founder post uses more than 1 screen');
    if (!slot.pillars.includes(post.pillar)) {
      const why = `(${slot.series}) must use pillar ${slot.pillars.join(' or ')}, not ${post.pillar}`;
      // A second Zenlot post breaks the one-a-week rule; any other pillar is only off-plan.
      if (zenlotPost) block(why);
      else warn(why);
    }
    // Series name and cover kicker: repaired in place, so followers always see the same label per slot.
    const series = post.pillar === 'product' || post.pillar === 'founder' ? ZENLOT_SERIES[post.pillar] : slot.series;
    post.series = series;
    if (post.slides[0]) post.slides[0].kicker = series;
    const text = `${post.caption}\n${post.slides.map((sl) => [sl.title, sl.body, ...sl.items].join(' ')).join('\n')}`;
    const crossRef = CROSS_DAY_REF.exec(text);
    if (crossRef) warn(`refers to another post ("${crossRef[0]}"); posts must stand alone`);
    if (!post.caption.includes('not financial advice')) {
      post.caption = `${post.caption.trim()}\n\nEducational content, not financial advice.`;
    }
    // Repaired in place: a wording slip must never cost the week its plan.
    if (post.ctaType === 'follow') post.caption = withFollowAsk(post.caption, series);
    // Swap unsupported maths symbols in place; anything still unrenderable or off-brand goes back to the model.
    // Also checks text fit, recomputes the maths and matches worked examples to app screens.
    if (post.slides.length) for (const issue of (await qaPost(post, { fix: true })).blocking) block(issue);
    post.hashtags = post.hashtags.map((t) => t.replace(/^#/, '').replace(/\s+/g, '')).slice(0, 5);
  }
  const missing = slots.flatMap((s, i) => (seen.has(i) ? [] : [`slot ${i} (${s.day}) not filled`]));
  const ctaCounts = new Map<string, number>();
  for (const p of plan.posts) ctaCounts.set(p.ctaType, (ctaCounts.get(p.ctaType) ?? 0) + 1);
  for (const [cta, n] of ctaCounts) if (n > 2) warnings.push(`${n} posts use the "${cta}" call to action; use each at most twice`);
  if ((ctaCounts.get('follow') ?? 0) < minFollow) warnings.push(`only ${ctaCounts.get('follow') ?? 0} post(s) ask people to follow; use "follow" on at least ${minFollow}`);
  const scenario = plan.posts.some((p) => p.slides.some((sl) => /\bhypothetical\b/i.test(`${sl.kicker} ${sl.title} ${sl.body}`)));
  if (!scenario) warnings.push('no post is a hypothetical scenario labelled "Hypothetical" on a slide; include exactly one');
  return { blocking, warnings, missing };
}

/** Every problem as one list, for the retry. */
const allProblems = (plan: WeekPlan, c: PlanCheck): string[] => [
  ...[...c.blocking].flatMap(([at, whys]) => whys.map((w) => `slot ${plan.posts[at].slot}: ${w}`)),
  ...c.missing,
  ...c.warnings,
];

/** Lower is better: posts that can go out matter far more than style. */
const score = (c: PlanCheck): number => (c.blocking.size + c.missing.length) * 100 + c.warnings.length;

export interface PlannedWeek {
  theme: string;
  /** One post per slot. `held` says why a post must not go out until someone fixes it. */
  posts: Array<{ post: PlannedPost; held: string[] }>;
  /** Anything else to know before approving the week. */
  warnings: string[];
}

/** Turns a checked plan into a usable week: one post per slot, bad posts held. Throws only if no post could go out. */
export function usableWeek(plan: WeekPlan, check: PlanCheck, slots: Slot[]): PlannedWeek {
  const bySlot = new Map<number, { post: PlannedPost; held: string[] }>();
  const warnings = [...check.missing, ...check.warnings];
  for (const [at, post] of plan.posts.entries()) {
    const held = check.blocking.get(at) ?? [];
    if (!slots[post.slot] || post.slides.length === 0) {
      warnings.push(`dropped "${post.topic}": ${held.join('; ')}`);
      continue;
    }
    const other = bySlot.get(post.slot);
    if (other) warnings.push(`slot ${post.slot} was filled twice; kept "${other.post.topic}", dropped "${post.topic}"`);
    else bySlot.set(post.slot, { post, held });
  }
  const posts = [...bySlot.values()].sort((a, b) => a.post.slot - b.post.slot);
  if (!posts.some((p) => p.held.length === 0)) throw new Error(`Week plan has no post that could be published: ${allProblems(plan, check).join('; ')}`);
  return { theme: plan.theme, posts, warnings };
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

/** The retry sees the plan it's correcting, so it fixes the problems instead of writing five new posts. */
export function retryPrompt(prompt: string, plan: WeekPlan, problems: string[]): string {
  return `${prompt}

# Your previous plan
${JSON.stringify(plan)}

It has these problems:
- ${problems.join('\n- ')}

Return the whole week again. Fix every problem and leave everything else in the plan as it is.`;
}

export async function planWeek(ctx: PlanningContext, ask: (prompt: string) => Promise<WeekPlan> = plan): Promise<PlannedWeek> {
  const prompt = buildPrompt(ctx);
  const minFollow = minFollowPosts(ctx.followers);
  let best = await ask(prompt);
  let check = await checkPlan(best, ctx.slots, minFollow);

  const problems = allProblems(best, check);
  if (problems.length) {
    console.warn(`[Strategist] plan issues: ${problems.join('; ')} — asking for a corrected plan`);
    try {
      const fixed = await ask(retryPrompt(prompt, best, problems));
      const fixedCheck = await checkPlan(fixed, ctx.slots, minFollow);
      if (score(fixedCheck) <= score(check)) [best, check] = [fixed, fixedCheck];
    } catch (err) {
      console.warn(`[Strategist] correction failed, using the first plan: ${err instanceof Error ? err.message : err}`);
    }
    const left = allProblems(best, check);
    if (left.length) console.warn(`[Strategist] still open: ${left.join('; ')}`);
  }
  return usableWeek(best, check, ctx.slots);
}
