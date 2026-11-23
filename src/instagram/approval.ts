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
 * Posts with no preview fingerprint at all (planned before previews were tracked) are left alone.
 */
export function previewMismatch(post: CalendarPost, renderFingerprint: string): string | null {
  if (!post.previewHash) return null;
  if (post.previewHash !== contentHash(post)) return 'its text changed since the last preview';
  if (post.previewRenderHash !== renderFingerprint)
    return post.previewRenderHash ? 'the slides look different from the last preview (template, font or screenshot change)' : 'the last preview was sent before slide images were tracked';
  return null;
}
