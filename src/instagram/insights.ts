import { instagramService } from '../services/social/instagram.service';
import { listWeeks, loadCalendar, saveCalendar } from './calendar';
import type { CalendarPost } from './types';

/**
 * Refreshes insights for published posts in the last `weeks` calendars and
 * writes them back. Posts younger than 24h are skipped (numbers still moving).
 */
export async function refreshInsights(weeks = 4): Promise<CalendarPost[]> {
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
      if (Date.now() - Date.parse(post.published.publishedAt) < 24 * 3600_000) continue;
      try {
        post.insights = await instagramService.getInsights(post.published.mediaId);
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
