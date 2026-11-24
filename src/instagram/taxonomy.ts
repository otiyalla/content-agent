// ---------------------------------------------------------------------------
// Topics for our own posts. One shared list, so posts, reader questions and
// (later) competitor counts can be compared. Change it deliberately: bump the
// version, and never reuse an id for a different meaning.
// ---------------------------------------------------------------------------

export const TAXONOMY_VERSION = 1;

interface Topic {
  /** What belongs here. */
  is: string;
  examples: [string, string];
  /** Easily confused with this, but belongs elsewhere. */
  nearMiss: string;
}

export const TOPICS = {
  'position-sizing': { is: 'How big a trade should be.', examples: ['lot size from a stop distance', 'risk per trade %'], nearMiss: 'how deep a losing run goes (drawdown)' },
  drawdown: { is: 'Losing runs, recovery maths, loss limits.', examples: ['a 50% loss needs 100%', 'daily loss limit'], nearMiss: 'sizing one trade (position-sizing)' },
  'risk-reward': { is: 'Reward against risk, win rate, expectancy.', examples: ['1.5R at 40% wins', 'why win rate misleads'], nearMiss: 'where to put a stop (trade-planning)' },
  'trade-planning': { is: 'Rules, checklists and levels before entry.', examples: ['pre-trade checklist', 'stop before entry'], nearMiss: 'reviewing afterwards (journaling)' },
  discipline: { is: 'Emotions and impulse: revenge trading, FOMO, tilt, overtrading.', examples: ['the trade after a loss', 'chasing a move'], nearMiss: 'a checklist that happens to help (trade-planning)' },
  journaling: { is: 'Recording and reviewing trades, process over outcome.', examples: ['weekly review', 'what to write after a trade'], nearMiss: 'how Zenlot does it (zenlot)' },
  'market-basics': { is: 'How forex works: pips, leverage, sessions, news days. Never a market view.', examples: ['pip value by account currency', 'why spreads widen on news'], nearMiss: 'where a pair is going (never posted)' },
  zenlot: { is: 'The app and the founder story.', examples: ['trade verdicts', 'from spreadsheet to app'], nearMiss: 'journaling advice that doesn\'t mention the app (journaling)' },
} as const satisfies Record<string, Topic>;

export type TopicId = keyof typeof TOPICS;
export const TOPIC_IDS = Object.keys(TOPICS) as [TopicId, ...TopicId[]];

export function topicsForPrompt(): string {
  return TOPIC_IDS.map((id) => `- ${id}: ${TOPICS[id].is} E.g. ${TOPICS[id].examples.join('; ')}. Not: ${TOPICS[id].nearMiss}.`).join('\n');
}
