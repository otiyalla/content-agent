import crypto from 'crypto';
import type { CalendarPost } from './types';

// ---------------------------------------------------------------------------
// What you reviewed is what ships.
//
// The Sunday email previews every post, and the post's content is fingerprinted
// (previewHash for the text, previewRenderHash for how the slides look). At
// publish time both are taken again. If the slides, caption, hashtags, alt text
// or the rendered images changed since anyone last saw them, the
// publisher emails a fresh preview of exactly what will go out and waits
// CHANGE_HOLD_MS before publishing, so there's time to set "status": "skipped".
// ---------------------------------------------------------------------------

export const CHANGE_HOLD_MS = 3 * 3600_000;

// A post that couldn't go out within this window is marked "missed" rather than
// published late (a Monday post landing on Wednesday crowds the next one).
export const MAX_LATENESS_MS = 30 * 3600_000;

// When the publisher runs, UTC. Keep in step with .github/workflows/instagram.yml and cron-trigger/.
const RUN_HOURS = [13, 14, 18];
const RUN_MINUTE = 7;

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** What's wrong with a post's scheduledAt, or null. A post with a bad time must never publish. */
export function scheduleProblem(post: Pick<CalendarPost, 'scheduledAt'>): string | null {
  const t: unknown = post.scheduledAt;
  if (typeof t === 'string' && ISO_TIME.test(t) && !Number.isNaN(Date.parse(t))) return null;
  return `scheduledAt ${JSON.stringify(t)} is not a valid time; write it like "2026-11-26T13:00:00.000Z"`;
}

/** The first publisher run at or after `t`. */
export function nextPublishRun(t: Date): Date {
  if (Number.isNaN(t.getTime())) throw new Error('nextPublishRun: invalid date');
  for (let day = 0; ; day++) {
    for (const hour of RUN_HOURS) {
      const run = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + day, hour, RUN_MINUTE));
      if (run >= t) return run;
    }
  }
}

/** Whether a post held until `after` still has a publisher run before it's too late to publish. */
export function canStillPublish(post: Pick<CalendarPost, 'scheduledAt'>, after: Date): boolean {
  return nextPublishRun(after).getTime() - Date.parse(post.scheduledAt) <= MAX_LATENESS_MS;
}

export function contentHash(post: Pick<CalendarPost, 'slides' | 'caption' | 'hashtags' | 'altText'>): string {
  const content = JSON.stringify({ slides: post.slides, caption: post.caption, hashtags: post.hashtags, altText: post.altText });
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Records that the post, as it stands now (text and rendered slides), has been previewed to the team. */
export function markPreviewed(post: CalendarPost, renderFingerprint: string, at: Date = new Date()): void {
  post.previewHash = contentHash(post);
  post.previewRenderHash = renderFingerprint;
  post.previewedAt = at.toISOString();
}

/**
 * Why a post needs a fresh preview before it can publish, or null if what ships matches what was seen.
 * A post nobody has been emailed (hand-added, or the Sunday email failed) always needs one.
 */
export function previewMismatch(post: CalendarPost, renderFingerprint: string): string | null {
  if (!post.previewHash) return 'it has never been previewed';
  if (post.previewHash !== contentHash(post)) return 'its text changed since the last preview';
  if (post.previewRenderHash !== renderFingerprint)
    return post.previewRenderHash ? 'the slides or their alt text differ from the last preview (call to action, series, template, font, screenshot or rendering change)' : 'the last preview was sent before slide images were tracked';
  return null;
}
