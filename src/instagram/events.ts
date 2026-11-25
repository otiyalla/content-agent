// ---------------------------------------------------------------------------
// Dated market events the planner treats as risk notes: know the date, decide
// your rule beforehand. Never a market view.
//
// Copied on 25 Nov 2026 from the official calendars. Dates can move (the Fed
// calls its own tentative), so check them when adding a year:
//   Jobs report: https://www.bls.gov/schedule/news_release/empsit.htm
//   Fed:         https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//                (decision day; the Oct 2027 meeting is strategy-only, so it's left out)
// ---------------------------------------------------------------------------

const JOBS = [
  '2026-12-04', '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04', '2027-07-02',
  '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03',
];
const FED = ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-11-17'];

export interface MarketEvent {
  name: string;
  date: Date;
}

const DAY = 86400_000;
const EVENTS: MarketEvent[] = [
  ...JOBS.map((d) => ({ name: 'US jobs report (NFP)', date: new Date(`${d}T00:00:00Z`) })),
  ...FED.map((d) => ({ name: 'Fed rate decision', date: new Date(`${d}T00:00:00Z`) })),
].sort((a, b) => a.date.getTime() - b.date.getTime());

const label = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Events in the week starting on `monday`. */
export function weekEvents(monday: Date): MarketEvent[] {
  return EVENTS.filter(({ date }) => date >= monday && date.getTime() < monday.getTime() + 7 * DAY);
}

/** The planner's instructions for the week's events, or '' if there are none. */
export function eventNotes(monday: Date): string {
  const events = weekEvents(monday);
  if (!events.length) return '';
  return `${events.map((e) => `- ${e.name}: ${label(e.date)}`).join('\n')}
Let one post, on a slot before the event (Pre-Trade Check or Trader's Mind fit best), use it as a risk-process reminder:
check the calendar before entering, and decide your own rule in advance (stand aside, trade smaller, or wait for
spreads to settle). Around a release, spreads can widen and a stop can fill worse than its level. Name the event with
its date ("${events[0].name.replace(' (NFP)', '')}, ${label(events[0].date)}"), never "tomorrow" or "this Friday", because posts can run late. Don't give a time.
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
const NAMES: Array<[RegExp, string]> = [
  [/\bNFP\b|\bnon-?farm\b|\bjobs report\b|\bpayrolls?\b/i, 'US jobs report (NFP)'],
  [/\bFOMC\b|\bthe fed\b|\bfed (?:rate|decision|meeting|day)\b|\bfederal reserve\b/i, 'Fed rate decision'],
];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b|\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi');
const VIEW = /\b(?:bullish|bearish|hawkish|dovish|rate (?:cut|hike)s?|(?:cut|hike|raise|lower)s? (?:interest )?rates|(?:dollar|usd|eurusd|gold) (?:will|should|to) \w+)\b/i;
const FORECAST = /\b(?:forecasts?|consensus|expected number|expectations?)\b/i;

/** Wrong dates and market views about a named event hold the post; forecast wording is only a warning. */
export function eventIssues(text: string): { block: string[]; warn: string[] } {
  const block: string[] = [];
  const warn: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const named = NAMES.filter(([re]) => re.test(sentence)).map(([, name]) => name);
    if (!named.length) continue;
    const known = EVENTS.filter((e) => named.includes(e.name)).map((e) => `${e.date.getUTCDate()}-${e.date.getUTCMonth()}`);
    for (const m of sentence.matchAll(DATE)) {
      const month = MONTHS.indexOf((m[2] ?? m[3]).toLowerCase().slice(0, 3));
      if (!known.includes(`${Number(m[1] ?? m[4])}-${month}`)) block.push(`gives "${m[0]}" as a date for the ${named.join(' / ')}; check src/instagram/events.ts`);
    }
    const view = VIEW.exec(sentence);
    if (view) block.push(`"${view[0]}" next to the ${named.join(' / ')}: reads as a market view`);
    const forecast = FORECAST.exec(sentence);
    if (forecast) warn.push(`mentions "${forecast[0]}" next to the ${named.join(' / ')}; risk process only`);
    if (/\b(?:today|tomorrow|tonight|this (?:monday|tuesday|wednesday|thursday|friday))\b/i.test(sentence)) warn.push(`dates the ${named.join(' / ')} relative to now; give the date, because posts can run late`);
  }
  return { block: [...new Set(block)], warn: [...new Set(warn)] };
}
