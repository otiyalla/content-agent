// ---------------------------------------------------------------------------
// What to warn about when posts don't go out. Pure functions with no Node or
// Cloudflare APIs: used by the Worker and by src/workflows/instagram-watch.ts.
// ---------------------------------------------------------------------------

export interface WatchedPost {
  id: string;
  scheduledAt: string;
  status: string;
  lastError?: string;
  missedNotice?: string;
}

/** A week's posts, null if it has no calendar, or 'unknown' if it couldn't be read. */
export type WatchedWeek = WatchedPost[] | null | 'unknown';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Slots are at 13:00 and 14:00, and the last retry is at 18:07 (a changed post also waits 3 hours). */
export const OVERDUE_MS = 5 * HOUR;
/** The plan runs on Sunday at 16:00 UTC. */
const PLAN_READY_HOUR = 19;
/** Days before the Worker's GitHub token expires on which to warn. */
const EXPIRY_DAYS = [14, 7, 3, 2, 1, 0];

/** ISO week id, same as isoWeekId in src/instagram/calendar.ts. */
export function weekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // its Thursday decides the year
  const year = d.getUTCFullYear();
  return `${year}-W${String(1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY))).padStart(2, '0')}`;
}

/** Weeks to look at: last week, this week, and next week once its plan should exist. */
export function weeksToWatch(now: Date): string[] {
  const at = (days: number) => weekId(new Date(now.getTime() + days * DAY));
  const planned = now.getUTCDay() === 0 && now.getUTCHours() >= PLAN_READY_HOUR;
  return [at(-7), at(0), ...(planned ? [at(1)] : [])];
}

/** Problems with the calendars. `weeks` holds an entry for each of weeksToWatch(now). */
export function calendarProblems(weeks: Record<string, WatchedWeek>, now: Date): string[] {
  const out: string[] = [];
  const [last, ...current] = weeksToWatch(now);
  for (const week of [last, ...current]) {
    const posts = weeks[week];
    if (posts === 'unknown') {
      out.push(`The calendar for ${week} could not be read, so its posts were not checked.`);
      continue;
    }
    if (!posts) {
      if (week !== last) out.push(`There is no plan for ${week}. Run the Instagram workflow with job "plan".`);
      continue;
    }
    for (const p of posts) {
      if (p.status === 'missed' && p.missedNotice) out.push(`${p.id} was missed (${p.missedNotice}), and its notice email has not been sent.`);
      if (p.status !== 'scheduled' && p.status !== 'failed') continue;
      const due = Date.parse(p.scheduledAt);
      if (Number.isNaN(due)) out.push(`${p.id} has a date that can't be read (${JSON.stringify(p.scheduledAt)}).`);
      else if (now.getTime() - due >= OVERDUE_MS) {
        out.push(`${p.id} was due ${new Date(due).toISOString().slice(0, 16).replace('T', ' ')} UTC and is not out${p.lastError ? `: ${p.lastError}` : ''}.`);
      }
    }
  }
  return out;
}

/** A warning if the Worker's GitHub token is close to expiring. `header` is github-authentication-token-expiration. */
export function tokenProblem(header: string | null, now: Date): string | null {
  // "2026-12-31 10:00:00 UTC" or "2026-12-31 10:00:00 -0500"
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/.exec(header ?? '');
  if (!m) return null;
  const zone = m[3] === 'UTC' ? 'Z' : `${m[3].slice(0, 3)}:${m[3].slice(3)}`;
  const days = Math.floor((Date.parse(`${m[1]}T${m[2]}${zone}`) - now.getTime()) / DAY);
  if (!EXPIRY_DAYS.includes(days)) return null;
  return `The Worker's GitHub token expires on ${m[1]} (${days === 0 ? 'within a day' : `${days} day${days === 1 ? '' : 's'} left`}). Renew it: cron-trigger/README.md.`;
}
