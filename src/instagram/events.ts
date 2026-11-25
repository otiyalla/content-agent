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
// "Whatever the Fed does, cut or hike" and hypotheticals take no side. A hedge covers only the claim it introduces.
const HEDGE = /\b(?:if|whether|whatever|whichever|either|hypothetical|illustrative|example|suppose|no matter)\b/i;
const HEDGE_FIRST = /^\W*(?:(?:and|or|but|so|even|for|an?|in|as)\s+)*(?:if|whether|whatever|whichever|either|hypothetical|illustrative|example|suppose|no matter)\b|\b(?:hypothetical|illustrative|example)\b/i;
const CLAUSE_END = /[,;:–—]\s+|\s+(?=(?:so|but|because|and|while|yet)\s)/i;
const BOTH_WAYS = /\b(?:rate\s+)?(?:cut|hike|raise|lower|hold)s?(?:(?:\s*[,\/]\s*|\s*,?\s+(?:or|and|nor)\s+)(?:an?\s+)?(?:rate\s+)?(?:cut|hike|raise|lower|hold)s?\b)+/gi;
const FORECAST = /\b(?:forecasts?|consensus|expected (?:number|figure|print))\b/i;
const EVENT_WORD = '(?:report|data|nfp|payrolls|decision|meeting|fed|fomc)';
const RELATIVE = new RegExp(
  `\\b${EVENT_WORD}(?:'s|’s)?[\\s:,-]+(?:(?:is|comes|lands|drops|out|due)\\s+)*(?:out\\s+)?(?:today|tomorrow|tonight|this\\s+(?:mon|tues|wednes|thurs|fri)day)\\b|\\b(?:today|tomorrow|tonight)(?:'s|’s|\\s+is|\\s+brings)\\s+(?:\\w+\\s+){0,3}?${EVENT_WORD}\\b|\\bthis\\s+(?:mon|tues|wednes|thurs|fri)day(?:'s|’s)?\\s+(?:\\w+\\s+){0,3}?${EVENT_WORD}\\b`,
  'i',
);

// "Don't bet that the dollar will rise" discourages a view. The clause ends where a new claim could start.
// "Don't expect ..." isn't here: it is itself a prediction, and so is "don't bet against ...".
const DISCOURAGED = /\b(?:don['’]t|do not|never|avoid|stop|can['’]t|cannot)\s+(?:ever\s+)?(?:try(?:ing)?\s+to\s+)?(?:bet|predict|guess|gambl|assum|forecast)(?:e|ing|ting)?\b(?!\s+against\b)(?:(?!\b(?:but|because|and|since|so|yet|as|while|instead|until|unless|before|after)\b)[^,;:.!?—–])*/gi;

/** The first unhedged market view in a sentence. */
function marketView(sentence: string): string | undefined {
  const text = sentence.replace(DISCOURAGED, '').replace(BOTH_WAYS, '');
  if (/^\W*(?:a\s+)?rate\s+(?:cut|hike)\?/i.test(text)) return undefined;
  let covered = false; // the clause before opened with a hedge: "If your stop is hit, ..."
  for (const clause of text.split(CLAUSE_END)) {
    const opens = HEDGE_FIRST.test(clause);
    if (!opens && !covered) {
      const m = OUTLOOK.exec(clause) ?? DIRECTION.exec(clause);
      const hedge = m && HEDGE.exec(clause);
      // "the dollar may fall if ..." is hedged; "the dollar will fall whatever happens" isn't.
      if (m && !(hedge && (hedge.index < m.index || /^(?:if|whether)$/i.test(hedge[0])))) return m[0];
    }
    covered = opens;
  }
  return undefined;
}

/** The event a date in `sentence` belongs to: one in its own clause (before it, or else after it), or else the one before. */
function eventForDate(sentence: string, at: number, end: number, found: Array<{ name: EventName; at: number }>): EventName {
  const clauseStart = Math.max(0, ...[...sentence.slice(0, at).matchAll(/[,;:–—]\s|\s(?:and|but|while)\s/gi)].map((m) => m.index! + m[0].length));
  const stop = sentence.slice(end).search(/[,;:–—]\s|\s(?:and|but|while)\s/i);
  const clauseEnd = stop < 0 ? sentence.length : end + stop;
  const before = found.filter((f) => f.at < at).sort((a, b) => b.at - a.at)[0];
  const after = found.filter((f) => f.at >= end).sort((a, b) => a.at - b.at)[0];
  if (before && before.at >= clauseStart) return before.name;
  if (after && (after.at < clauseEnd || !before)) return after.name;
  // "Jobs report, 4 December" looks back; "..., and on 9 December, the Fed decision" looks ahead.
  return after && /^(?:and\s+)?(?:then\s+)?on\s+$/i.test(sentence.slice(clauseStart, at)) ? after.name : before!.name;
}

// Which of the Fed's two days a date is about.
const FED_DAY = /(\b(?:rate|fed|fomc|reserve|policy|meeting)(?:['’]s)?\s+(?:decision|announcement)\b|\b(?:fed|fomc|reserve)\s+(?:decides|announces)\b)|\bmeet(?:s|ings?)?\b|\b(?:starts?|begins?)\b/gi;

/** Whether the words nearest before a date (or, with none, first after it) are about the decision, not the meeting. */
function datesDecision(sentence: string, at: number): boolean {
  const all = [...sentence.matchAll(FED_DAY)];
  const word = all.filter((m) => m.index! < at).pop() ?? all[0];
  return !!word?.[1];
}

/** "Only 6 may survive" or "you may 2 ..." rather than the month. Only a lowercase "may" can be the verb. */
function isModalMay(sentence: string, m: RegExpMatchArray): boolean {
  const [whole, wdBefore, , d2, monthA, monthB, , d4, year, wdAfter] = m;
  if ((monthA ?? monthB) !== 'may' || wdBefore || wdAfter || year || d2 || d4) return false;
  const before = sentence.slice(0, m.index);
  const after = sentence.slice(m.index! + whole.length);
  if (monthB) return /\b(?:you|we|they|it|i|that|which|traders)\s+$/i.test(before);
  if (/\d(?:st|nd|rd|th)\b|\bof\b/i.test(whole) || /\b(?:on|for|by|is|before|after|until|from|due|out|since)\s+$/i.test(before)) return false;
  return /^\s+[a-z]/i.test(after) && !NAMES.some(([re]) => after.trimStart().search(re) === 0);
}

const EVENT_DATE_WORD = /\b(?:report|data|numbers|release|decision|decides|announce\w*|meet(?:s|ings?)?|starts?|begins?|ends?|lands?|due|out|moved|event|it(?:['’]s)?)\b/i;

/** "your 3 December trades": a date that says what else it is about. */
function datesSomethingElse(sentence: string, m: RegExpMatchArray): boolean {
  return /\b(?:your|my|our)\s+$/i.test(sentence.slice(0, m.index)) || /^(?:['’]s)?\s+(?:trades?|journal|reviews?|entry|entries|sessions?|log|stats|results)\b/i.test(sentence.slice(m.index! + m[0].length));
}

/** Words of its own lead to this date, none about an event: "before NFP on 4 December, finish your plan by 3 December". */
function leadsElsewhere(lead: string): boolean {
  if (EVENT_DATE_WORD.test(lead) || NAMES.some(([re]) => lead.search(re) >= 0)) return false;
  return lead.replace(/\b(?:on|for|by|or|and|not|to|the|is|was|no|sorry|actually)\b/gi, '').search(/[a-z]{2}/i) >= 0;
}

/** Days an event may be dated: this week's if it has one, otherwise any listed. The Fed's first day counts, except for its decision. */
function acceptedDays(name: EventName, monday: Date | undefined, decisionOnly: boolean): Date[] {
  const mine = EVENTS.filter((e) => e.name === name);
  const thisWeek = monday ? weekEvents(monday).filter((e) => e.name === name) : [];
  const use = thisWeek.length ? thisWeek : mine;
  return use.flatMap((e) => (name === 'Fed rate decision' && !decisionOnly ? [new Date(e.date.getTime() - DAY), e.date] : [e.date]));
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
      let end = 0;
      const dates = [...sentence.matchAll(DATE)].filter((m) => !isModalMay(sentence, m)).map((m) => {
        const [whole, , d1, d2, monthA, monthB, d3, d4, year] = m;
        const at = m.index!;
        const lead = sentence.slice(end, at);
        end = at + whole.length;
        const name = eventForDate(sentence, at, end, found);
        const month = MONTHS.indexOf((monthA ?? monthB).toLowerCase().slice(0, 3));
        const days = [d1 ?? d3, d2 ?? d4].filter(Boolean).map(Number);
        const decisionOnly = days.length === 1 && datesDecision(sentence, at);
        const matches = days.map((d) =>
          acceptedDays(name, monday, decisionOnly).find((x) => x.getUTCDate() === d && x.getUTCMonth() === month && (!year || x.getUTCFullYear() === Number(year))),
        );
        return { m, lead, name, matches, right: matches.every(Boolean) };
      });
      for (const { m, lead, name, matches, right } of dates) {
        const whole = m[0].trim();
        if (!right) {
          if (datesSomethingElse(sentence, m)) continue;
          // The event has its right date here already, and this one has its own words.
          if (dates.some((d) => d.right && d.name === name) && leadsElsewhere(lead)) continue;
          block.push(`gives "${whole}" as a date for the ${name}; check src/instagram/events.ts`);
          continue;
        }
        const weekday = (m[1] ?? m[9])?.toLowerCase();
        if (weekday && !matches.some((x) => DAYS[x!.getUTCDay()] === weekday)) block.push(`gives the wrong weekday: "${whole}" for the ${name}`);
      }
      const other = OTHER_DATE.exec(sentence);
      if (other) warn.push(`"${other[0].trim()}" next to the ${about} can't be checked; write the date like "4 December"`);
      // A claim in the sentence before or after counts too.
      const view = [sentence, sentences[i - 1] ?? '', sentences[i + 1] ?? ''].map(marketView).find(Boolean);
      if (view) block.push(`"${view}" next to the ${about}: reads as a market view`);
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
