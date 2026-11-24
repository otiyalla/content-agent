import fs from 'fs';
import path from 'path';
import { CALENDAR_DIR, isoWeekId } from './calendar';
import { latestFollowers } from './account';
import type { AccountInsights } from '../services/social/instagram.service';

// Our own account's totals for the 7 days up to each weekly report, one entry per ISO week, in
// content/instagram/account-metrics.json. Committed with the calendar. null = not available, never 0.

export interface AccountWeek {
  id: string; // ISO week
  profileViews: number | null;
  websiteClicks: number | null; // taps on the link in bio
  reach: number | null;
  followers: number | null;
  recordedAt: string;
}

const FILE = path.join(path.dirname(CALENDAR_DIR), 'account-metrics.json');

export function weekEntry(a: AccountInsights, followers: number | undefined, now: Date): AccountWeek {
  // The report may slip past midnight into Monday: it still describes the week that just ended.
  const week = isoWeekId(new Date(now.getTime() - (now.getUTCDay() === 1 ? 86400_000 : 0)));
  return { id: week, profileViews: a.profileViews ?? null, websiteClicks: a.websiteClicks ?? null, reach: a.reach ?? null, followers: followers ?? null, recordedAt: now.toISOString() };
}

export function recordAccountWeek(a: AccountInsights, now: Date): void {
  const all = fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as AccountWeek[]) : [];
  const entry = weekEntry(a, latestFollowers(), now);
  const kept = all.filter((w) => w.id !== entry.id);
  fs.writeFileSync(FILE, `${JSON.stringify([...kept, entry].sort((x, y) => x.id.localeCompare(y.id)), null, 2)}\n`);
}
