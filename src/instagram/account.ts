import fs from 'fs';
import path from 'path';
import { instagramService } from '../services/social/instagram.service';
import { CALENDAR_DIR } from './calendar';

// ---------------------------------------------------------------------------
// Follower history: one entry per UTC day in content/instagram/account-history.json.
// Instagram only reports daily follower counts for accounts with 100+ followers,
// so we record the profile's follower count on every publisher run and keep the
// latest reading for each day. Committed with the calendar by the workflow.
// ---------------------------------------------------------------------------

export interface AccountDay {
  date: string; // YYYY-MM-DD (UTC)
  followers: number;
  posts: number;
  recordedAt: string;
}

const FILE = path.join(path.dirname(CALENDAR_DIR), 'account-history.json');

export function loadAccountHistory(): AccountDay[] {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as AccountDay[];
}

/** Reads followers and post count and stores them for today (replacing today's earlier reading). */
export async function recordAccountDay(now: Date = new Date()): Promise<AccountDay | null> {
  if (!instagramService.configured) return null;
  const profile = await instagramService.getProfile();
  if (typeof profile.followers_count !== 'number') return null;
  const day: AccountDay = {
    date: now.toISOString().slice(0, 10),
    followers: profile.followers_count,
    posts: profile.media_count ?? 0,
    recordedAt: now.toISOString(),
  };
  const history = loadAccountHistory().filter((d) => d.date !== day.date);
  history.push(day);
  history.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(history, null, 2)}\n`);
  return day;
}

// Until the account has this many followers, some of every week's posts ask people to follow.
export const FOLLOWER_GOAL = 1000;
const MIN_FOLLOW_POSTS = 2;

/** How many of a week's posts must ask people to follow. An unknown count is treated as a new account. */
export function minFollowPosts(followers: number | undefined): number {
  return followers === undefined || followers < FOLLOWER_GOAL ? MIN_FOLLOW_POSTS : 0;
}

/** The most recent follower count on record. */
export function latestFollowers(): number | undefined {
  return loadAccountHistory().at(-1)?.followers;
}

/** Follower change over the last `days` days, from the recorded history. */
export function followerChange(days = 7, now: Date = new Date()): { now?: number; then?: number; change?: number } {
  const history = loadAccountHistory();
  const latest = history[history.length - 1];
  if (!latest) return {};
  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
  const then = [...history].reverse().find((d) => d.date <= cutoff) ?? history[0];
  return { now: latest.followers, then: then.followers, change: latest.followers - then.followers };
}
