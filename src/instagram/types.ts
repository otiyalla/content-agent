import * as z from 'zod/v4';
import { SCREEN_IDS } from './screens';

// ---------------------------------------------------------------------------
// Content model for Instagram posts.
//
// The same schema is used for:
//   1. Claude's structured output when planning a week (llm.service.ts)
//   2. The calendar JSON committed to the repo (calendar.ts) — humans edit it
//   3. The renderer that turns slides into JPEGs (renderer.ts)
//
// Optional text fields are modelled as strings that may be empty rather than
// optional properties: it keeps the structured-output schema flat and makes
// the calendar file predictable to hand-edit.
// ---------------------------------------------------------------------------

export const SLIDE_LAYOUTS = [
  'cover', // carousel first slide: kicker + big title + subtitle (body)
  'point', // numbered teaching point: title + body
  'stat', // big number (stat) + title as label + body as context
  'list', // title + items[] as a checklist
  'mythfact', // title = the myth, body = the fact
  'quote', // title = the quote / one-liner, body = attribution or framing
  'question', // engagement prompt: title = question, items = answer options
  'cta', // closing slide: title + body (save / share / follow prompt)
  'screen', // real app screenshot in a phone frame: kicker + title above, screen = which screenshot
] as const;

export const PILLARS = [
  'risk-math', // position sizing, R:R, drawdown maths, expectancy
  'psychology', // revenge trading, FOMO, discipline, tilt
  'process', // routines, checklists, rules
  'journaling', // reviewing trades, journal prompts, verdicts, judging process over outcome
  'myth-busting', // common bad advice corrected
  'community', // questions, polls, relatable moments
  'product', // Zenlot features, framed as a solution to a real problem
  'founder', // the founder's own story (spreadsheet → app), first person, real facts only
] as const;

// Tags for reading results later: which opening and which call to action a post used.
export const HOOK_TYPES = [
  'stat', // a surprising number up front
  'myth', // a common belief, then the correction
  'question', // asks the reader something
  'mistake', // names a costly habit
  'story', // founder or scenario narrative
  'how-to', // promises a method or formula
  'checklist', // promises a list to keep
  'contrarian', // challenges popular advice
] as const;

export const CTA_TYPES = ['save', 'share', 'comment', 'follow', 'link'] as const;

export const SlideSchema = z.object({
  layout: z.enum(SLIDE_LAYOUTS),
  kicker: z.string().describe('Small label above the title, e.g. "RISK MATH" or "Step 2". Empty string if none.'),
  title: z.string().describe('Main text. Keep it under ~12 words; it is rendered very large.'),
  body: z.string().describe('Supporting text, under ~40 words. Empty string if none.'),
  stat: z.string().describe('Only for layout "stat": the headline number, e.g. "-50%" or "1.5R". Empty string otherwise.'),
  items: z.array(z.string()).describe('Only for "list" (3-6 short items) and "question" (2-4 options). Empty array otherwise.'),
  screen: z.enum([...SCREEN_IDS, '']).describe('Only for layout "screen": which app screenshot to show. Empty string otherwise.'),
});

export const PlannedPostSchema = z.object({
  slot: z.number().int().describe('Index of the posting slot this post fills (0-based, from the slots provided).'),
  pillar: z.enum(PILLARS),
  topic: z.string().describe('One-line internal description of the post.'),
  slides: z.array(SlideSchema).describe('1 slide for a single image; 3-8 slides for a carousel.'),
  caption: z.string().describe('Full Instagram caption. First line is the hook. Plain text, line breaks allowed, no hashtags here.'),
  hashtags: z.array(z.string()).describe('3-5 targeted hashtags without the # symbol.'),
  altText: z.string().describe('Accessible description of the first image for screen readers, under 300 characters.'),
  hookType: z.enum(HOOK_TYPES).describe('Which kind of opening the cover and caption line 1 use.'),
  ctaType: z.enum(CTA_TYPES).describe('The main call to action at the end of the post (cta slide and caption).'),
  series: z.string().describe('Name of the recurring series this post belongs to, e.g. "Survival Maths". Empty string if none.'),
  rationale: z.string().describe('Why this post should perform, referencing past performance data when available.'),
});

export const WeekPlanSchema = z.object({
  theme: z.string().describe('The unifying theme for the week.'),
  posts: z.array(PlannedPostSchema),
});

export type Slide = z.infer<typeof SlideSchema>;
export type PlannedPost = z.infer<typeof PlannedPostSchema>;
export type WeekPlan = z.infer<typeof WeekPlanSchema>;
export type Pillar = (typeof PILLARS)[number];

// ---------------------------------------------------------------------------
// Calendar (persisted) types
// ---------------------------------------------------------------------------

export type PostStatus =
  | 'scheduled' // waiting for its time
  | 'skipped' // a human vetoed it — never publish
  | 'published'
  | 'failed' // publish attempted and errored; will retry until overdue
  | 'missed'; // never published and now too old to be relevant

export type SnapshotAge = '48h' | '7d';

export interface PostInsights {
  fetchedAt: string;
  reach?: number;
  saved?: number;
  shares?: number;
  likes?: number;
  comments?: number;
  views?: number;
  follows?: number; // accounts that followed from this post
  profileVisits?: number; // profile visits from this post
  linkTaps?: number; // taps on the link in bio after viewing this post
}

export interface CalendarPost extends Omit<PlannedPost, 'slot'> {
  id: string; // e.g. "2026-W48-mon"
  scheduledAt: string; // ISO timestamp (UTC)
  status: PostStatus;
  attempts?: number;
  lastError?: string;
  /** Fingerprint of the content as last previewed by email (see approval.ts). */
  previewHash?: string;
  previewedAt?: string;
  published?: {
    mediaId: string;
    permalink?: string;
    publishedAt: string;
    imageUrls: string[];
    /** The Story that points at this post (see STORY_RESHARE_PILLARS in the publisher), if one went out. */
    storyMediaId?: string;
  };
  insights?: PostInsights; // latest numbers (age varies; for display only)
  /**
   * Numbers frozen at fixed ages after publishing, so posts can be compared
   * fairly (see insights.ts). Only taken inside a window after each age; a
   * post whose window was missed has no snapshot rather than a late one.
   */
  insightSnapshots?: Partial<Record<SnapshotAge, PostInsights>>;
}

export interface WeekCalendar {
  week: string; // ISO week, e.g. "2026-W48"
  theme: string;
  generatedAt: string;
  posts: CalendarPost[];
}
