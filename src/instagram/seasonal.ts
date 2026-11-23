// ---------------------------------------------------------------------------
// Moments in the trading year the planner should plan around. Matched by the
// planned week's dates (UTC), so they apply every year without editing.
// Market events like NFP or central-bank meetings are a separate item; this
// is about the trader's own calendar.
// ---------------------------------------------------------------------------

interface Moment {
  /** Inclusive month/day range; the week matches if any of its 7 days falls inside. */
  from: [number, number];
  to: [number, number];
  note: string;
}

const MOMENTS: Moment[] = [
  {
    from: [12, 14],
    to: [12, 27],
    note: 'Year-end. Liquidity thins and many traders stop for the holidays. Good week for "review your year": how to read a year of trades in your journal, what to count (rule breaks, R per trade), what to keep and drop. Mention thin holiday markets only as a risk-process point, never as a market call.',
  },
  {
    from: [12, 28],
    to: [1, 14],
    note: 'New year. The biggest moment of the year for setting trading rules and starting a journal. Plan around "your trading rules for the year": writing 3-5 rules you can actually follow, setting max risk per trade and daily loss limits, and starting a journal on day one. The Wednesday Zenlot post should tie to starting the year with a journal. No resolutions hype, no promises of results.',
  },
];

const md = (d: Date) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

function inRange(d: Date, m: Moment): boolean {
  const v = md(d);
  const from = m.from[0] * 100 + m.from[1];
  const to = m.to[0] * 100 + m.to[1];
  return from <= to ? v >= from && v <= to : v >= from || v <= to; // ranges may wrap the year end
}

/** Notes for any moments that overlap the week starting on `monday`. */
export function seasonalNotes(monday: Date): string {
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400_000));
  return MOMENTS.filter((m) => days.some((d) => inRange(d, m)))
    .map((m) => `- ${m.note}`)
    .join('\n');
}
