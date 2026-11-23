import { instagramService } from '../services/social/instagram.service';
import { listWeeks, loadCalendar, saveCalendar } from './calendar';
import type { CalendarPost, SnapshotAge } from './types';

// ---------------------------------------------------------------------------
// Post insights.
//
// Comparing posts on whatever numbers they had on Sunday is unfair: Monday's
// post is ~6 days old by then and Saturday's ~26 hours, so Saturday (and the
// product post that lives there) always looks worse. So besides the latest
// numbers, each post gets snapshots frozen at fixed ages, and the planner
// ranks on those only.
//
// The publisher runs three times a day and takes any snapshot that's due.
// The Sunday planner also refreshes the latest numbers for the weekly email.
// ---------------------------------------------------------------------------

const HOUR = 3600_000;

/** Snapshot ages and how long after each age a snapshot may still be taken. */
export const SNAPSHOTS: Record<SnapshotAge, { at: number; window: number }> = {
  '48h': { at: 48 * HOUR, window: 36 * HOUR },
  '7d': { at: 168 * HOUR, window: 72 * HOUR },
};

const ageOf = (post: CalendarPost, now: Date) => now.getTime() - Date.parse(post.published!.publishedAt);

export function dueSnapshots(post: CalendarPost, now: Date): SnapshotAge[] {
  if (post.status !== 'published' || !post.published) return [];
  const age = ageOf(post, now);
  return (Object.keys(SNAPSHOTS) as SnapshotAge[]).filter((k) => {
    const { at, window } = SNAPSHOTS[k];
    return !post.insightSnapshots?.[k] && age >= at && age < at + window;
  });
}

/**
 * Updates insights for published posts in the last `weeks` calendars and saves them.
 *   mode "snapshots": only fetch posts with a fixed-age snapshot due (cheap; every publisher run)
 *   mode "all":       also refresh the latest numbers of every post older than 24h (Sunday planner)
 */
export async function refreshInsights(weeks = 4, opts: { mode?: 'all' | 'snapshots'; now?: Date } = {}): Promise<CalendarPost[]> {
  const mode = opts.mode ?? 'all';
  const now = opts.now ?? new Date();
  const updated: CalendarPost[] = [];
  if (!instagramService.configured) {
    console.log('[Insights] Instagram not configured — skipping insight refresh');
    return updated;
  }

  for (const week of listWeeks().slice(-weeks)) {
    const cal = loadCalendar(week);
    if (!cal) continue;
    let changed = false;
    for (const post of cal.posts) {
      if (post.status !== 'published' || !post.published) continue;
      const due = dueSnapshots(post, now);
      const wantLatest = mode === 'all' && ageOf(post, now) >= 24 * HOUR;
      if (!due.length && !wantLatest) continue;
      try {
        const fresh = await instagramService.getInsights(post.published.mediaId);
        post.insights = fresh;
        for (const k of due) {
          post.insightSnapshots = { ...post.insightSnapshots, [k]: fresh };
          console.log(`[Insights] ${post.id}: ${k} snapshot — reach ${fresh.reach ?? '?'}, saves ${fresh.saved ?? '?'}`);
        }
        updated.push(post);
        changed = true;
      } catch (err) {
        console.warn(`[Insights] ${post.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (changed) saveCalendar(cal);
  }
  console.log(`[Insights] refreshed ${updated.length} post(s)`);
  return updated;
}
