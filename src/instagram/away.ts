import type { CalendarPost } from './types';

export const AWAY_REASON = 'due while the owner was away (OWNER_AWAY)';

/**
 * While the owner is away nothing publishes. A post that comes due is skipped rather than left waiting, so
 * posts never burst out on their return. Set its status back to "scheduled" with a new time to run it.
 * Returns true if the post was skipped now.
 */
export function skipWhileAway(post: CalendarPost, now: Date, away: boolean): boolean {
  if (!away || (post.status !== 'scheduled' && post.status !== 'failed')) return false;
  const due = Date.parse(post.scheduledAt);
  if (!(due <= now.getTime())) return false; // not due yet, or a bad date (reported by the publisher as before)
  post.status = 'skipped';
  post.held = [...(post.held ?? []), AWAY_REASON];
  return true;
}
