import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Real Zenlot app screenshots (dark theme, EN/FR/ES), copied from the
// zenlot-site repo (assets/screenshots/<lang>/dark). Used in "screen" slides.
//
// Rules (from the site's infographic brief):
//   - Never edit the UI itself; explanations go in callouts outside the phone.
//   - Label screenshots "Example data".
//   - Only pair a screen with claims the screen visibly supports.
//
// 07-verdict is deliberately excluded: the captured screen shows "NaNR" as the
// R-multiple (an app bug) and untranslated coaching text in FR/ES. Re-capture
// it after the fix, then add it here.
// ---------------------------------------------------------------------------

export const SCREEN_IDS = [
  'insights',
  'risk-profile',
  'trading-rules',
  'history',
  'journal',
  'trade-entry',
  'analysis',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];
export type ScreenLang = 'en' | 'fr' | 'es';

interface ScreenInfo {
  file: string;
  quality: 'hero' | 'good' | 'weak';
  shows: string;
}

export const SCREENS: Record<ScreenId, ScreenInfo> = {
  insights: {
    file: '08-insights.png',
    quality: 'hero',
    shows:
      'Journals → Insights tab. "13 trades analyzed over 90 days". Top priority card marked Critical: "Rule-breaking streak — Several trades in a row broke your plan. 5 consecutive trades with a major plan violation. Seen in 5 of 13 trades", followed by the evidence list of those trades (NZDCHF, USDJPY, GBPCAD...).',
  },
  'risk-profile': {
    file: '06-risk-profile.png',
    quality: 'hero',
    shows:
      'Risk Profile settings: "Set your account balance and governance limits. These size your positions and check every trade." Fields: account balance, max risk per trade 2%, max portfolio exposure 5%, max daily drawdown 5% (Zenlot uses it to warn or block trades after losses reach this level for the day), max weekly drawdown 8%.',
  },
  'trading-rules': {
    file: '02-trading-rules.png',
    quality: 'good',
    shows:
      'Trading Rules: save standard stop-loss and take-profit pip values that are suggested for every trade (example: TP 75 pips, SL 45 pips); toggle gain/loss display between pips and account currency.',
  },
  history: {
    file: '04-history.png',
    quality: 'good',
    shows:
      'Trade History (36 trades): search by symbol, status or journal content; quick filters All/Wins/Losses/Recent; trade cards with R:R, P/L, pips and status (open, reached S/L) plus the note attached to the trade ("Market in range").',
  },
  journal: {
    file: '03-journal.png',
    quality: 'good',
    shows:
      'A journal entry titled "Trading Plan" with a written weekly plan: review last week\'s trades and mistakes, check why a stop was hit early (news or bad luck), plan for the week. Pin/archive/edit actions.',
  },
  'trade-entry': {
    file: '01-trade-entry.png',
    quality: 'weak',
    shows:
      'Empty "Enter Trade Details" form: currency search, entry price, pip value, lot size, stop loss and take profit fields, Show Note / Confirm buttons. Fields are blank, so only use it to explain the workflow.',
  },
  analysis: {
    file: '05-analysis.png',
    quality: 'weak',
    shows:
      'Home screen: Monthly Pips and Monthly Analysis cards (2 trades) above an empty state "Nothing is open right now — use the quiet space to prepare your next setup" with Start First Trade / Build Trading Plan buttons.',
  },
};

const ROOT = path.join(process.cwd(), 'assets', 'app-screens');
const cache = new Map<string, string>();

export function screenDataUri(id: ScreenId, lang: ScreenLang = 'en'): string {
  const key = `${lang}/${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const file = path.join(ROOT, lang, SCREENS[id].file);
  const uri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  cache.set(key, uri);
  return uri;
}

/** Prompt-ready description of the available screens for the strategist. */
export function screensForPrompt(): string {
  return SCREEN_IDS.map((id) => `- "${id}" (${SCREENS[id].quality}): ${SCREENS[id].shows}`).join('\n');
}
