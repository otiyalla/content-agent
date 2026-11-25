// ---------------------------------------------------------------------------
// Dated market events the planner treats as risk notes: know the date, decide
// your rule beforehand. Never a market view.
//
// Copied on 25 Nov 2026 from the official calendars. Dates can move (the Fed
// calls its own tentative), so check them when adding a year:
//   Jobs report: https://www.bls.gov/schedule/news_release/empsit.htm
//   Fed:         https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//                (decision day, the second of two; the Oct 2027 meeting is strategy-only, so it's left out)
// ---------------------------------------------------------------------------

import { slotTime, type Slot } from './calendar';

const JOBS = [
  '2026-12-04', '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04', '2027-07-02',
  '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03',
];
const FED = ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-11-17'];

type EventName = 'US jobs report (NFP)' | 'Fed rate decision';
export interface MarketEvent {
  name: EventName;
  date: Date;
}

const DAY = 86400_000;
const EVENTS: MarketEvent[] = [
  ...JOBS.map((d) => ({ name: 'US jobs report (NFP)' as const, date: new Date(`${d}T00:00:00Z`) })),
  ...FED.map((d) => ({ name: 'Fed rate decision' as const, date: new Date(`${d}T00:00:00Z`) })),
].sort((a, b) => a.date.getTime() - b.date.getTime());

const label = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Events in the week starting on `monday`. */
export function weekEvents(monday: Date): MarketEvent[] {
  return EVENTS.filter(({ date }) => date >= monday && date.getTime() < monday.getTime() + 7 * DAY);
}

/** Slots of the week that run before the event's day. */
const slotsBefore = (event: MarketEvent, monday: Date, slots: Slot[]) => slots.filter((s) => slotTime(monday, s).getTime() < event.date.getTime());

/** The planner's instructions for the week's events, or '' if there are none. */
export function eventNotes(monday: Date, slots: Slot[]): string {
  const events = weekEvents(monday);
  if (!events.length) return '';
  const lines = events.map((e) => {
    // The week's one Zenlot post keeps its own job.
    const free = slotsBefore(e, monday, slots).filter((s) => !s.pillars.includes('product'));
    return `- ${e.name}: ${label(e.date)}. ${free.length ? `Use one of these slots, which run before it: ${free.map((s) => `${s.series} (${s.day})`).join(', ')}.` : 'No slot runs before it, so leave it out.'}`;
  });
  return `${lines.join('\n')}
Let one post per event, on a slot listed for it, use it as a risk-process reminder: check the calendar before entering, and
decide your own rule in advance (stand aside, trade smaller, or wait for spreads to settle). Around a release, spreads can
widen and a stop can fill worse than its level. Name the event with its date, written out ("${events[0].name.replace(' (NFP)', '')},
${label(events[0].date)}"), never "tomorrow" or "this Friday", because posts can run late. Don't give a time.
Never a market view: no forecast, consensus or expected number, no direction, nothing about what the Fed or a currency
will do. Don't invent how far price moved on past releases. All other posts ignore the event, and it doesn't have to
be the week's theme. All other rules still apply.`;
}

/** A note for the plan email when the list is about to run out, so it doesn't go quiet unnoticed. */
export function eventsRunOut(monday: Date): string[] {
  const left = [JOBS, FED].some((list) => new Date(`${list[list.length - 1]}T00:00:00Z`).getTime() - monday.getTime() < 28 * DAY);
  return left ? ['market event dates are running out; add the next ones in src/instagram/events.ts'] : [];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NAMES: Array<[RegExp, EventName]> = [
  [/\bNFP\b|\bnon-?farm\b|\bpayrolls?\b|\bjobs\s+(?:report|data|numbers|day)\b|\bemployment\s+(?:report|situation)\b/gi, 'US jobs report (NFP)'],
  // "Fed" needs its capital, so "fed up" isn't the Fed; another bank's decision isn't either.
  [/\bFOMC\b|\b(?:Fed|FED)\b(?!\s+up\b|-up\b)|\bthe fed\b(?!\s+up\b|-up\b)|\b[Ff]ederal [Rr]eserve\b|\b(?<!(?:ECB|BoE|BOE|BoJ|BOJ|England|Japan|Canada)(?:'s|’s)?\s+(?:[Ii]nterest\s+)?)(?:[Ii]nterest [Rr]ate|[Rr]ate) [Dd]ecision\b/g, 'Fed rate decision'],
];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY = '(mon|tue|wed|thu|fri|sat|sun)(?:s|rs|nes|ur|urs)?(?:day)?';
const DAY_NO = '(\\d{1,2})(?:st|nd|rd|th)?';
const RANGE = `${DAY_NO}(?:\\s*(?:-|–|to|and|&)\\s*${DAY_NO})?`;
// "Friday 4 December", "8-9 December 2026", "Fri, Dec 4th", "December 4 (Friday)".
const DATE = new RegExp(
  `(?:\\b${WEEKDAY}[.,]?\\s+(?:the\\s+)?)?(?:\\b${RANGE}\\s+(?:of\\s+)?${MONTH}\\b|\\b${MONTH}\\.?\\s+${RANGE}\\b(?!\\s*[%:]))(?:,?\\s+(20\\d\\d)\\b)?(?:\\s*\\(${WEEKDAY}\\))?`,
  'gi',
);
// Dates we can't read for sure: "12/5", "on the 5th".
const OTHER_DATE = /(?:\b(?:on|for|is)|[:,])\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?=[\s.,!?)]|$)(?!\s+(?:size|of|risk))|\bon\s+the\s+\d{1,2}(?:st|nd|rd|th)\b/i;

// Market views. These are the wordings we know; the owner's approval is the real check.
const INSTRUMENT = "(?:(?<!\\d\\s?)(?:the\\s+)?(?:dollar|usd)(?!\\s*\\d|\\s+(?:risk|amount|value|figure|account|loss))|eur\\/?usd|gbp\\/?usd|usd\\/?jpy|euro|sterling|yen|gold|stocks)";
const MOVE = '(?:rall(?:y|ies)|rises?|falls?|drops?|climbs?|surges?|soars?|sinks?|jumps?|dumps?|pumps?|strengthens?|weakens?|higher|lower|lifts?|push(?:es)?|boosts?|hits?|sends?|drives?)';
const DIRECTION = new RegExp(`\\b${INSTRUMENT}\\b(?:\\s+\\w+){0,2}?\\s+${MOVE}\\b|\\b(?:lift|push|boost|hit|send|drive|sink)(?:e?s)?\\s+(?:the\\s+)?${INSTRUMENT}\\b`, 'i');
const OUTLOOK = new RegExp(
  [
    '\\b(?:bullish|bearish|hawkish|dovish)\\b',
    '\\brate\\s+(?:cut|hike)s?\\b',
    '\\b(?:fed|fomc|federal reserve)\\s+(?:will|should|may|might|could|is\\s+(?:expected|likely|set|going)\\s+to)\\s+(?:\\w+\\s+)?(?:cut|hike|hold|raise|lower|pause)s?\\b',
    '\\b(?:expect|predict|see|bet on)(?:s|ed|ing)?\\s+(?:an?\\s+)?(?:\\w+\\s+)?(?:beat|miss|upside|downside)\\b',
    '\\b(?:strong|weak|hot|soft|cool|big|better|worse)\\s+(?:us\\s+)?(?:jobs\\s+(?:report|data|numbers?)|payrolls|nfp|employment)\\b',
  ].join('|'),
  'i',
);
// "Whatever the Fed does, cut or hike" and hypotheticals take no side.
const HEDGE = /\b(?:if|whether|whatever|whichever|either|hypothetical|illustrative|example|suppose|no matter)\b/i;
const FORECAST = /\b(?:forecasts?|consensus|expected (?:number|figure|print))\b/i;
const EVENT_WORD = '(?:report|data|nfp|payrolls|decision|meeting|fed|fomc)';
const RELATIVE = new RegExp(
  `\\b${EVENT_WORD}(?:'s|’s)?[\\s:,-]+(?:(?:is|comes|lands|drops|out|due)\\s+)*(?:out\\s+)?(?:today|tomorrow|tonight|this\\s+(?:mon|tues|wednes|thurs|fri)day)\\b|\\b(?:today|tomorrow|tonight)(?:'s|’s|\\s+is|\\s+brings)\\s+(?:\\w+\\s+){0,3}?${EVENT_WORD}\\b|\\bthis\\s+(?:mon|tues|wednes|thurs|fri)day(?:'s|’s)?\\s+(?:\\w+\\s+){0,3}?${EVENT_WORD}\\b`,
  'i',
);

/** Days an event's name may be dated: this week's if it has one, otherwise any listed. The Fed's first day counts. */
function acceptedDays(name: EventName, monday: Date | undefined): Date[] {
  const mine = EVENTS.filter((e) => e.name === name);
  const thisWeek = monday ? weekEvents(monday).filter((e) => e.name === name) : [];
  const use = thisWeek.length ? thisWeek : mine;
  return use.flatMap((e) => (name === 'Fed rate decision' ? [new Date(e.date.getTime() - DAY), e.date] : [e.date]));
}

/** Which events a post names. */
export function namedEvents(fields: string[]): EventName[] {
  return NAMES.filter(([re]) => fields.some((f) => f.search(re) >= 0)).map(([, name]) => name);
}

/**
 * Wrong dates and market views about a named event hold the post; other slips are warnings. Each field is read on
 * its own, so a title's event and a body's unrelated date aren't mixed up.
 */
export function eventIssues(fields: string[], monday?: Date): { block: string[]; warn: string[] } {
  const block: string[] = [];
  const warn: string[] = [];
  for (const field of fields) {
    const sentences = field.replace(/\*\*/g, '').split(/(?<=[!?;])\s+|(?<=(?<!\b[A-Z][a-z]{2})\.)\s+|\n+/);
    sentences.forEach((sentence, i) => {
      const found = NAMES.flatMap(([re, name]) => [...sentence.matchAll(re)].map((m) => ({ name, at: m.index! })));
      if (!found.length) return;
      const about = [...new Set(found.map((f) => f.name))].join(' / ');
      for (const m of sentence.matchAll(DATE)) {
        const [whole, wdBefore, d1, d2, monthA, monthB, d3, d4, year, wdAfter] = m;
        const monthWord = monthA ?? monthB;
        if (monthWord === 'may') continue; // "you may 2x", not the month
        // With two events in a sentence, the date belongs to the nearest one.
        const name = found.reduce((a, b) => (Math.abs(b.at - m.index!) < Math.abs(a.at - m.index!) ? b : a)).name;
        const month = MONTHS.indexOf(monthWord.toLowerCase().slice(0, 3));
        const days = [d1 ?? d3, d2 ?? d4].filter(Boolean).map(Number);
        const matches = days.map((d) =>
          acceptedDays(name, monday).find((a) => a.getUTCDate() === d && a.getUTCMonth() === month && (!year || a.getUTCFullYear() === Number(year))),
        );
        if (matches.some((x) => !x)) {
          block.push(`gives "${whole.trim()}" as a date for the ${name}; check src/instagram/events.ts`);
          continue;
        }
        const weekday = (wdBefore ?? wdAfter)?.toLowerCase();
        if (weekday && !matches.some((x) => DAYS[x!.getUTCDay()] === weekday)) block.push(`gives the wrong weekday: "${whole.trim()}" for the ${name}`);
      }
      const other = OTHER_DATE.exec(sentence);
      if (other) warn.push(`"${other[0].trim()}" next to the ${about} can't be checked; write the date like "4 December"`);
      const both = /\b(?:cut\w*|lower)\b.*\b(?:hike\w*|raise)\b|\b(?:hike\w*|raise)\b.*\b(?:cut\w*|lower)\b/i.test(sentence);
      const outlook = HEDGE.test(sentence) || both ? null : OUTLOOK.exec(sentence);
      const near = [sentence, sentences[i - 1] ?? '', sentences[i + 1] ?? ''].filter((x) => !HEDGE.test(x));
      const move = near.map((x) => DIRECTION.exec(x)).find(Boolean);
      const view = outlook ?? move;
      if (view) block.push(`"${view[0]}" next to the ${about}: reads as a market view`);
      const forecast = FORECAST.exec(sentence);
      if (forecast) warn.push(`mentions "${forecast[0]}" next to the ${about}; risk process only`);
      if (RELATIVE.test(sentence)) warn.push(`dates the ${about} relative to now; give the date, because posts can run late`);
    });
  }
  return { block: [...new Set(block)], warn: [...new Set(warn)] };
}

/** A warning if a post about one of the week's events runs on or after it. */
export function lateForEvent(fields: string[], monday: Date, slot: Slot): string[] {
  const named = namedEvents(fields);
  return weekEvents(monday)
    .filter((e) => named.includes(e.name) && slotTime(monday, slot).getTime() >= e.date.getTime())
    .map((e) => `is about the ${e.name} but runs on or after it (${label(e.date)})`);
}

/** The text of a post that readers see, one entry per field. */
export function postFields(post: { slides: Array<{ kicker: string; title: string; body: string; stat: string; items: string[] }>; caption: string; altText?: string }): string[] {
  return [post.caption, post.altText ?? '', ...post.slides.flatMap((s) => [s.kicker, s.title, s.body, s.stat, ...s.items])].filter(Boolean);
}
