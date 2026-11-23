import crypto from 'crypto';
import type { CalendarPost } from './types';

// ---------------------------------------------------------------------------
// What you reviewed is what ships.
//
// The Sunday email previews every post, and the post's content is fingerprinted
// (previewHash). At publish time the fingerprint is taken again. If the slides,
// caption, hashtags or alt text changed since anyone last saw them, the
// publisher emails a fresh preview of exactly what will go out and waits
// CHANGE_HOLD_MS before publishing, so there's time to set "status": "skipped".
// ---------------------------------------------------------------------------

export const CHANGE_HOLD_MS = 3 * 3600_000;

export function contentHash(post: Pick<CalendarPost, 'slides' | 'caption' | 'hashtags' | 'altText'>): string {
  const content = JSON.stringify({ slides: post.slides, caption: post.caption, hashtags: post.hashtags, altText: post.altText });
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Records that the post, as it stands now, has been previewed to the team. */
export function markPreviewed(post: CalendarPost, at: Date = new Date()): void {
  post.previewHash = contentHash(post);
  post.previewedAt = at.toISOString();
}
