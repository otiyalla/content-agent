import { ZENLOT_PRODUCT } from '../config/zenlot';
import { complete, LLMChainError } from './llm-providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentType =
  | 'educational'
  | 'personal'
  | 'commentary'
  | 'engagement'
  | 'promotional'
  | 'entertainment';

export interface PainPointAnalysis {
  isSolvableByZenlot: boolean;
  explanation: string;
  draftResponse?: string;
  featureRequest?: string;
  engagementScore?: number;
}

export interface GeneratedContent {
  content: string;
  contentType: ContentType;
  isThread: boolean;
  estimatedEngagement: 'low' | 'medium' | 'high';
}

export interface RedditEducationalPost {
  title: string;
  body: string; // markdown formatted
  estimatedEngagement: 'low' | 'medium' | 'high';
}

// Product Feedback Synthesizer: RICE-scored feature request from community pain points
export interface SynthesizedFeatureRequest {
  title: string;
  description: string;
  riceScore: {
    reach: number;    // estimated users affected (1-10)
    impact: number;   // severity of the pain (1-10)
    confidence: number; // how certain we are (percentage)
    effort: number;   // estimated dev effort in weeks
    total: number;    // RICE = (R * I * C) / E
  };
  supportingQuotes: string[];
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low';
  source: 'reddit' | 'twitter' | 'mixed';
}

// Kept for backwards compatibility: thrown when every provider (Claude, OpenAI, Grok) fails.
export { LLMChainError as LLMDualProviderError };

// ---------------------------------------------------------------------------
// Shared prompts
// ---------------------------------------------------------------------------

const ZENLOT_CONTEXT = `
${ZENLOT_PRODUCT}
`;

const HOOK_FORMULAS = [
  "Contrarian take: \"Most traders think X. They're wrong. Here's why:\"",
  'Story hook: Start with a trading failure or surprising outcome, then deliver the lesson.',
  'Question hook: Open with a question that challenges conventional wisdom.',
  'Data hook: Lead with a stat or observation from real trading behavior.',
  "Consequence hook: \"If you're doing X, here's what's actually happening to your account:\"",
];

// ---------------------------------------------------------------------------
// LLMService
// ---------------------------------------------------------------------------

export class LLMService {
  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Extracts a JSON object or array from a text response.
   * Falls back to `defaultValue` if parsing fails.
   */
  private parseJson<T>(text: string, defaultValue: T): T {
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    const raw = objMatch?.[0] ?? arrMatch?.[0];
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  // -------------------------------------------------------------------------
  // Public API — identical interface regardless of which provider runs
  // -------------------------------------------------------------------------

  /**
   * Analyzes a social media post to determine if Zenlot solves the pain point.
   * Scores engagement value (1-10) so the agent prioritises high-ROI replies.
   */
  async analyzePainPoint(postContent: string): Promise<PainPointAnalysis> {
    const prompt = `You are an expert forex trader and product manager for Zenlot.
${ZENLOT_CONTEXT}

Analyze this social media post from a trader and determine:
1. Whether Zenlot directly solves their problem
2. How valuable it is to reply (engagement score 1-10 — high = large audience, clear pain, likely to convert)
3. If solvable: a helpful, empathetic, non-spammy reply that leads with value before mentioning Zenlot
4. If not solvable: a brief feature request for our product team

Social Media Post:
"${postContent}"

Reply in this exact JSON format:
{
  "isSolvableByZenlot": boolean,
  "explanation": "Brief explanation.",
  "engagementScore": number,
  "draftResponse": "If solvable: empathetic reply leading with value, mention Zenlot naturally. Under 240 chars for direct replies, or start with '🧵' for a thread.",
  "featureRequest": "If not solvable: brief feature request description."
}`;

    const defaultValue: PainPointAnalysis = {
      isSolvableByZenlot: false,
      explanation: 'Parse error',
      engagementScore: 0,
    };

    const text = await complete('analyzePainPoint', prompt, { maxTokens: 1024, tier: 'complex', json: true });
    return this.parseJson<PainPointAnalysis>(text, defaultValue);
  }

  /**
   * Generates content following the Twitter Engager content mix strategy.
   * Hook formulas and thread structure are embedded in the prompt.
   */
  async generatePost(
    topic: string,
    contentType: ContentType,
    marketContext?: string,
  ): Promise<GeneratedContent> {
    const hookInstructions = HOOK_FORMULAS[Math.floor(Math.random() * HOOK_FORMULAS.length)];

    const typeGuidance: Record<ContentType, string> = {
      educational:
        'Write an educational thread that teaches a specific risk management concept. Lead with a strong hook, deliver 3-5 numbered insights, end with an actionable takeaway.',
      personal:
        'Write a first-person post from the founder about building Zenlot, using ONLY the facts in the founder story above (never invent scenes, numbers or outcomes). Authentic, not polished.',
      commentary:
        'Write sharp industry commentary on current market behaviour or a common trader mistake. Contrarian but backed by logic.',
      engagement:
        'Write a reply-bait post: ask a genuine question about trader habits or poll the community on a risk management dilemma.',
      promotional:
        'Write a promotional tweet that leads with a real trader problem, then positions Zenlot as the solution. Value-first, never pushy.',
      entertainment:
        'Write a relatable, slightly humorous take on trader psychology. Dry wit, no cringe. Must still deliver a kernel of insight.',
    };

    const prompt = `You are running the Twitter account for Zenlot, a free forex trading journal app.
${ZENLOT_CONTEXT}

Content type: ${contentType}
Topic: "${topic}"
${marketContext ? `Current market context: ${marketContext}` : ''}

Hook guidance: ${hookInstructions}
Content guidance: ${typeGuidance[contentType]}

Rules:
- No hashtag spam (max 1 if truly relevant). No cringe emojis. Professional and sleek.
- If under 280 chars, return a single tweet. If it needs more space, format as a numbered thread starting with 🧵.
- Mention Zenlot only for promotional type, or very naturally in educational content.
- Be contrarian but logical. Always deliver real value.

Return JSON:
{
  "content": "the tweet or full thread text",
  "isThread": boolean,
  "estimatedEngagement": "low" | "medium" | "high"
}`;

    const defaultValue = { content: '', isThread: false, estimatedEngagement: 'low' as const };

    const text = await complete('generatePost', prompt, { maxTokens: 1024, tier: 'complex', json: true });
    const parsed = this.parseJson(text, defaultValue);

    return { ...parsed, contentType };
  }

  /**
   * Generates dynamic search queries to expand beyond hardcoded seeds.
   * Uses gpt-4o-mini on fallback — simple list task, doesn't need the big model.
   */
  async generateSearchQueries(existingQueries: string[]): Promise<string[]> {
    const prompt = `You are a social media analyst for Zenlot, a free forex trading journal app.
${ZENLOT_CONTEXT}

We currently search for traders using these queries: ${JSON.stringify(existingQueries)}

Generate 5 additional search queries that would surface posts from traders experiencing problems that Zenlot can solve.
Focus on: blown accounts, position sizing mistakes, emotional trading, stop-loss avoidance, poor journaling habits.
Make them conversational (how people actually tweet/post), not keyword stuffed.

Return a JSON array of strings only: ["query1", "query2", ...]`;

    const text = await complete('generateSearchQueries', prompt, { maxTokens: 512, tier: 'simple', json: true });
    return this.parseJson<string[]>(text, []);
  }

  /**
   * Generates a Reddit-native reply to a pain-point post.
   *
   * Reddit Community Builder 90/10 rule:
   * - Lead with genuine empathy and community-first insight (90%)
   * - Only mention Zenlot naturally at the end if truly relevant (10%)
   * Developer Advocate rule: disclose affiliation authentically, never astroturf.
   *
   * Format: markdown, 150-350 words, structured paragraphs.
   */
  async generateRedditReply(
    postContent: string,
    subreddit: string,
    postTitle?: string,
  ): Promise<string | null> {
    const prompt = `You are a forex risk management expert and the founder of Zenlot (a free forex trading journal app) participating authentically in Reddit's r/${subreddit} community.

${ZENLOT_CONTEXT}

A community member posted this:
${postTitle ? `Title: "${postTitle}"\n` : ''}Content: "${postContent}"

Write a helpful Reddit reply following these rules:
- 150-350 words. Use Reddit markdown (**bold**, paragraphs, occasional bullets — not walls of bullets).
- Lead with genuine empathy and a concrete insight that proves you understand their situation.
- The bulk of your reply (90%) must be pure value: specific actionable advice that helps them RIGHT NOW regardless of Zenlot.
- Only in the last 1-2 sentences, if Zenlot directly solves their specific problem, mention it naturally and honestly using only the real founder story, e.g. "I kept making more mistakes when I traded off-plan, so my Excel journal slowly turned into an app, Zenlot (free)". Never invent other personal details. If not relevant, omit it entirely.
- End with a genuine question that invites further discussion.
- Sound like a real person who trades, not a marketing bot.

Return ONLY the reply text — no JSON, no wrapper.`;

    const text = await complete('generateRedditReply', prompt, { maxTokens: 1024, tier: 'complex' });
    return text.trim() || null;
  }

  /**
   * Generates an educational Reddit post (title + markdown body).
   *
   * Reddit Community Builder: value-first posts build karma and trusted contributor
   * status. Zero promotion — Developer Advocate handles authentic disclosure.
   */
  async generateRedditEducationalPost(
    topic: string,
    subreddit: string,
    communityContext?: string,
  ): Promise<RedditEducationalPost> {
    const prompt = `You are a forex risk management expert writing a high-value educational post for r/${subreddit}.

${ZENLOT_CONTEXT}
${communityContext ? `Community context: ${communityContext}` : ''}

Topic: "${topic}"

Write a Reddit educational post. Rules:
- Title: compelling, specific, native to Reddit. Under 300 chars. (e.g. "How I stopped revenge trading: the rule that actually worked" — not "5 Tips To Improve Your Trading").
- Body: 300-600 words. Use Reddit markdown: **bold** for key terms, ## headers sparingly, bullets only when genuinely list-like.
- 100% value. Zero promotion. Zero mention of Zenlot.
- Include a specific personal insight that proves expertise — not generic advice.
- End with a question that invites community discussion.
- Optional final line: "> I trade for X years and built tools to help with this — happy to answer questions."

Return JSON:
{
  "title": "the post title",
  "body": "full markdown body",
  "estimatedEngagement": "low" | "medium" | "high"
}`;

    const defaultValue: RedditEducationalPost = { title: '', body: '', estimatedEngagement: 'low' };

    const text = await complete('generateRedditEducationalPost', prompt, { maxTokens: 2048, tier: 'complex', json: true });
    return this.parseJson<RedditEducationalPost>(text, defaultValue);
  }

  /**
   * Synthesizes multiple pain-point posts into RICE-scored feature requests.
   *
   * Product Feedback Synthesizer: groups themes, applies RICE scoring, extracts
   * supporting quotes. Replaces the current one-email-per-post approach with
   * a structured digest the product team can act on directly.
   */
  async synthesizeFeedback(
    posts: { content: string; platform: string; url: string }[],
  ): Promise<SynthesizedFeatureRequest[]> {
    if (posts.length === 0) return [];

    const postsSummary = posts
      .map((p, i) => `[${i + 1}] (${p.platform}) ${p.content.substring(0, 200)}`)
      .join('\n');

    const prompt = `You are a Product Feedback Synthesizer for Zenlot, a free forex trading journal app.
${ZENLOT_CONTEXT}

The following are social media posts from traders expressing problems Zenlot doesn't currently solve.
Group them into distinct feature themes and produce RICE-scored feature requests for the product team.

Posts:
${postsSummary}

RICE scoring guide:
- Reach (1-10): how many users affected? (10 = nearly all forex traders)
- Impact (1-10): how severe is the pain? (10 = causes account-blowing losses)
- Confidence (0-100): certainty in reach/impact estimates
- Effort (weeks): rough engineering estimate
- Total = (Reach × Impact × Confidence) / Effort

Return a JSON array of up to 5 feature requests, most impactful first:
[
  {
    "title": "Short feature name",
    "description": "What it does and why it matters",
    "riceScore": { "reach": number, "impact": number, "confidence": number, "effort": number, "total": number },
    "supportingQuotes": ["verbatim quote 1", "verbatim quote 2"],
    "suggestedPriority": "critical" | "high" | "medium" | "low",
    "source": "reddit" | "twitter" | "mixed"
  }
]`;

    const text = await complete('synthesizeFeedback', prompt, { maxTokens: 2048, tier: 'complex', json: true });
    return this.parseJson<SynthesizedFeatureRequest[]>(text, []);
  }

  /**
   * Scores a thought-leader post for engagement value.
   * Used by the community-engager to decide whether to reply.
   */
  async scoreEngagementOpportunity(
    postContent: string,
    authorFollowers?: number,
  ): Promise<{ score: number; addedValueReply: string | null; reason: string }> {
    const prompt = `You are the Twitter strategist for Zenlot, a free forex trading journal app.
${ZENLOT_CONTEXT}

A thought leader in the trading/forex space posted this:
"${postContent}"
${authorFollowers ? `Author has ~${authorFollowers.toLocaleString()} followers.` : ''}

Score this engagement opportunity (1-10) based on:
- Relevance to forex risk management
- Audience size and quality
- Whether we can add genuine value with a reply
- How naturally Zenlot fits into the conversation

If score >= 6, draft a reply that adds real insight (not a promotion). Keep it under 240 chars.

Return JSON:
{
  "score": number,
  "reason": "brief explanation",
  "addedValueReply": "reply text or null if score < 6"
}`;

    const defaultValue = { score: 0, reason: '', addedValueReply: null };

    const text = await complete('scoreEngagementOpportunity', prompt, { maxTokens: 512, tier: 'simple', json: true });
    return this.parseJson(text, defaultValue);
  }
}

export const llmService = new LLMService();
