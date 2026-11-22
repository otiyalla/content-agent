import fs from 'fs';
import path from 'path';
import type { CalendarPost, WeekCalendar } from './types';

// ---------------------------------------------------------------------------
// Weekly content calendar, stored as one JSON file per ISO week in
// content/instagram/calendar/. The GitHub Action commits these files, so the
// calendar doubles as an editable, version-controlled review queue:
//   - set "status": "skipped" to veto a post
//   - edit slide text / caption freely — images are re-rendered at publish time
// ---------------------------------------------------------------------------

export const CALENDAR_DIR = path.join(process.cwd(), 'content', 'instagram', 'calendar');

export interface Slot {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  hourUtc: number;
  format: 'carousel' | 'single';
}

// 5 posts/week. Carousels earn the most saves and shares in finance education,
// so they get the three strongest days. 13:00 UTC = London afternoon / New York
// pre-open, when forex traders are most active. Saturday is a carousel because
// the market is closed and traders do their weekly reviews.
export const WEEKLY_SLOTS: Slot[] = [
  { day: 'mon', hourUtc: 13, format: 'carousel' },
  { day: 'tue', hourUtc: 13, format: 'single' },
  { day: 'wed', hourUtc: 13, format: 'carousel' },
  { day: 'thu', hourUtc: 13, format: 'single' },
  { day: 'sat', hourUtc: 14, format: 'carousel' },
];

const DAY_OFFSET: Record<Slot['day'], number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

// ---------------------------------------------------------------------------
// ISO week helpers (UTC)
// ---------------------------------------------------------------------------

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The week that starts on the next Monday after `now` (what Sunday planning targets). */
export function nextWeekMonday(now: Date = new Date()): Date {
  const monday = mondayOf(now);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

export function slotTime(weekMonday: Date, slot: Slot): Date {
  const d = new Date(weekMonday);
  d.setUTCDate(d.getUTCDate() + DAY_OFFSET[slot.day]);
  d.setUTCHours(slot.hourUtc, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function fileFor(week: string): string {
  return path.join(CALENDAR_DIR, `${week}.json`);
}

export function loadCalendar(week: string): WeekCalendar | null {
  const file = fileFor(week);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as WeekCalendar;
}

export function saveCalendar(cal: WeekCalendar): string {
  fs.mkdirSync(CALENDAR_DIR, { recursive: true });
  const file = fileFor(cal.week);
  fs.writeFileSync(file, JSON.stringify(cal, null, 2) + '\n');
  return file;
}

/** All saved weeks, oldest first. */
export function listWeeks(): string[] {
  if (!fs.existsSync(CALENDAR_DIR)) return [];
  return fs
    .readdirSync(CALENDAR_DIR)
    .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort();
}

/** Posts from the most recent `n` weeks — used for de-duplication and performance feedback. */
export function recentPosts(n: number): CalendarPost[] {
  return listWeeks()
    .slice(-n)
    .flatMap((w) => loadCalendar(w)?.posts ?? []);
}
