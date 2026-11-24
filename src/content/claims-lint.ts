import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Claims we can't support, and competitor names, kept out of saved plans and
// reports. The calendar is public, so a brief's competitor insight must not end
// up in its topic, theme or rationale. Competitor names come from the
// RADAR_COMPETITOR_NAMES secret (comma-separated) and are never printed.
// ---------------------------------------------------------------------------

const PHRASES: Array<[RegExp, string]> = [
  [/\bshare of voice\b/i, '"share of voice" (can\'t be measured here)'],
  [/\bmarket share\b/i, '"market share" (can\'t be measured here)'],
  [/\btrending (?:on|across) (?:instagram|ig|x|twitter|tiktok|youtube|social)\b/i, '"trending on ..." (we only see accounts we chose)'],
  [/\b(?:market|industry|category)[- ]leading\b|\b(?:the )?leading (?:\w+ ){0,2}(?:app|journal|platform|tool)\b|\bmarket leader\b/i, '"leading" (can\'t be shown)'],
];

/** Long quoted passages: someone else's words. Short scare quotes are fine. */
const QUOTE = /["“][^"”]{40,}["”]/;

const names = () => (env.RADAR_COMPETITOR_NAMES ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 2);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');

/** What's wrong with a report or saved field, in words that are safe to log. */
export function lintClaims(text: string): string[] {
  const out = PHRASES.filter(([p]) => p.test(text)).map(([, why]) => why);
  if (names().some((n) => new RegExp(`(?<![\\p{L}\\p{N}])@?${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'iu').test(text))) out.push('names a competitor');
  return out;
}

/** Saved planning fields also may not quote other people or name accounts other than ours. */
export function lintSaved(text: string): string[] {
  const out = lintClaims(text);
  if (QUOTE.test(text)) out.push('quotes someone at length');
  if (/(?<![\w.])@(?!zenlot_app\b)[a-z0-9_.]{2,}/i.test(text)) out.push('names an account');
  return out;
}
