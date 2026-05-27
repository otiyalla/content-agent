import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY ?? 'missing' });

if (!env.OPENAI_API_KEY) {
  console.warn('[LLM] OPENAI_API_KEY is not set — fallback provider unavailable. Set it to enable automatic failover.');
}

// ---------------------------------------------------------------------------
// Shared model config per operation
// (Backend Architect mapping: complex → gpt-4o, simple/list → gpt-4o-mini)
// ---------------------------------------------------------------------------

const OPENAI_MODELS = {
  analyzePainPoint: 'gpt-4o',
  generatePost: 'gpt-4o',
  generateSearchQueries: 'gpt-4o-mini',
  scoreEngagementOpportunity: 'gpt-4o-mini',
  generateRedditReply: 'gpt-4o',
  generateRedditEducationalPost: 'gpt-4o',
  synthesizeFeedback: 'gpt-4o',
} as const;

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

// Thrown when both Anthropic and OpenAI fail on the same operation.
export class LLMDualProviderError extends Error {
  constructor(
    public readonly operation: string,
    public readonly anthropicError: unknown,
    public readonly openaiError: unknown,
  ) {
    super(`[LLM_DUAL_FAILURE] Both providers failed for op=${operation}`);
    this.name = 'LLMDualProviderError';
  }
}

// ---------------------------------------------------------------------------
// Shared prompts
// ---------------------------------------------------------------------------

const ZENLOT_CONTEXT = `
Zenlot is a risk management app for forex traders. Core features:
- Hard stop-loss enforcement (calculates position size based on risk %)
- Risk-to-reward ratio tracking
- Trade journaling with notes and performance analytics
- Win rate, profitability, and drawdown analysis
- Quick trade logging and open trade monitoring
- Weekly/monthly performance reviews
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

  /** Calls Claude and returns the raw text response. */
  private async callClaude(prompt: string, maxTokens: number): Promise<string> {
    const message = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }

  /** Calls OpenAI and returns the raw text response. */
  private async callOpenAI(
    model: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string> {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      // All prompts explicitly request JSON — safe to enable structured output
      response_format: { type: 'json_object' },
    });
    return response.choices[0].message.content ?? '';
  }

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

  /**
   * Tries the Anthropic function first. On any error, logs and falls back to
   * the OpenAI function. If both fail, throws LLMDualProviderError.
   *
   * Callers never need to know which provider handled the request.
   */
  private async withFallback<T>(
    anthropicFn: () => Promise<T>,
    openAiFn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      return await anthropicFn();
    } catch (anthropicErr) {
      const reason = anthropicErr instanceof Error ? anthropicErr.message : String(anthropicErr);
      console.warn(
        `[LLM_FALLBACK] op=${operationName} provider=openai reason="${reason}"`,
      );

      try {
        return await openAiFn();
      } catch (openaiErr) {
        const oaiReason = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
        console.error(
          `[LLM_DUAL_FAILURE] op=${operationName} anthropicErr="${reason}" openaiErr="${oaiReason}"`,
        );
        throw new LLMDualProviderError(operationName, anthropicErr, openaiErr);
      }
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

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 1024);
        return this.parseJson<PainPointAnalysis>(text, defaultValue);
      },
      async () => {
        const text = await this.callOpenAI(OPENAI_MODELS.analyzePainPoint, prompt, 1024);
        return this.parseJson<PainPointAnalysis>(text, defaultValue);
      },
      'analyzePainPoint',
    );
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
        'Write a personal/behind-the-scenes post about building Zenlot or insights from working with forex traders. Authentic, not polished.',
      commentary:
        'Write sharp industry commentary on current market behaviour or a common trader mistake. Contrarian but backed by logic.',
      engagement:
        'Write a reply-bait post: ask a genuine question about trader habits or poll the community on a risk management dilemma.',
      promotional:
        'Write a promotional tweet that leads with a real trader problem, then positions Zenlot as the solution. Value-first, never pushy.',
      entertainment:
        'Write a relatable, slightly humorous take on trader psychology. Dry wit, no cringe. Must still deliver a kernel of insight.',
    };

    const prompt = `You are running the Twitter account for Zenlot, a risk management app for forex traders.
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

    const parsed = await this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 1024);
        return this.parseJson(text, defaultValue);
      },
      async () => {
        const text = await this.callOpenAI(OPENAI_MODELS.generatePost, prompt, 1024);
        return this.parseJson(text, defaultValue);
      },
      'generatePost',
    );

    return { ...parsed, contentType };
  }

  /**
   * Generates dynamic search queries to expand beyond hardcoded seeds.
   * Uses gpt-4o-mini on fallback — simple list task, doesn't need the big model.
   */
  async generateSearchQueries(existingQueries: string[]): Promise<string[]> {
    const prompt = `You are a social media analyst for Zenlot, a forex risk management app.
${ZENLOT_CONTEXT}

We currently search for traders using these queries: ${JSON.stringify(existingQueries)}

Generate 5 additional search queries that would surface posts from traders experiencing problems that Zenlot can solve.
Focus on: blown accounts, position sizing mistakes, emotional trading, stop-loss avoidance, poor journaling habits.
Make them conversational (how people actually tweet/post), not keyword stuffed.

Return a JSON array of strings only: ["query1", "query2", ...]`;

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 512);
        return this.parseJson<string[]>(text, []);
      },
      async () => {
        const text = await this.callOpenAI(OPENAI_MODELS.generateSearchQueries, prompt, 512);
        return this.parseJson<string[]>(text, []);
      },
      'generateSearchQueries',
    );
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
    const prompt = `You are a forex risk management expert and the founder of Zenlot (a risk management app for forex traders) participating authentically in Reddit's r/${subreddit} community.

${ZENLOT_CONTEXT}

A community member posted this:
${postTitle ? `Title: "${postTitle}"\n` : ''}Content: "${postContent}"

Write a helpful Reddit reply following these rules:
- 150-350 words. Use Reddit markdown (**bold**, paragraphs, occasional bullets — not walls of bullets).
- Lead with genuine empathy and a concrete insight that proves you understand their situation.
- The bulk of your reply (90%) must be pure value: specific actionable advice that helps them RIGHT NOW regardless of Zenlot.
- Only in the last 1-2 sentences, if Zenlot directly solves their specific problem, mention it naturally as "something I built because I had this exact problem". If not relevant, omit it entirely.
- End with a genuine question that invites further discussion.
- Sound like a real person who trades, not a marketing bot.

Return ONLY the reply text — no JSON, no wrapper.`;

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 1024);
        return text.trim() || null;
      },
      async () => {
        const response = await openai.chat.completions.create({
          model: OPENAI_MODELS.generateRedditReply,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        return response.choices[0].message.content?.trim() ?? null;
      },
      'generateRedditReply',
    );
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

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 2048);
        return this.parseJson<RedditEducationalPost>(text, defaultValue);
      },
      async () => {
        const text = await this.callOpenAI(OPENAI_MODELS.generateRedditEducationalPost, prompt, 2048);
        return this.parseJson<RedditEducationalPost>(text, defaultValue);
      },
      'generateRedditEducationalPost',
    );
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

    const prompt = `You are a Product Feedback Synthesizer for Zenlot, a forex risk management app.
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

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 2048);
        return this.parseJson<SynthesizedFeatureRequest[]>(text, []);
      },
      async () => {
        const text = await this.callOpenAI(OPENAI_MODELS.synthesizeFeedback, prompt, 2048);
        return this.parseJson<SynthesizedFeatureRequest[]>(text, []);
      },
      'synthesizeFeedback',
    );
  }

  /**
   * Scores a thought-leader post for engagement value.
   * Used by the community-engager to decide whether to reply.
   */
  async scoreEngagementOpportunity(
    postContent: string,
    authorFollowers?: number,
  ): Promise<{ score: number; addedValueReply: string | null; reason: string }> {
    const prompt = `You are the Twitter strategist for Zenlot, a forex risk management app.
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

    return this.withFallback(
      async () => {
        const text = await this.callClaude(prompt, 512);
        return this.parseJson(text, defaultValue);
      },
      async () => {
        const text = await this.callOpenAI(
          OPENAI_MODELS.scoreEngagementOpportunity,
          prompt,
          512,
        );
        return this.parseJson(text, defaultValue);
      },
      'scoreEngagementOpportunity',
    );
  }
}

export const llmService = new LLMService();
