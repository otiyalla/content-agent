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
  /** Where the app's rows end, in px of the 738x1600 English screenshot: good places to cut it off. */
  rowEnds: number[];
  /** Short screen-reader description of the screenshot. */
  alt: string;
  /**
   * Example figures visible on the screen. A post that shows the screen must
   * use the same figures in its worked example, or quote them on the screen
   * slide so readers see it's a different example.
   */
  figures?: { accountBalance?: number; accountCurrency?: string; riskPerTradePct?: number };
}

export const SCREENS: Record<ScreenId, ScreenInfo> = {
  insights: {
    rowEnds: [822, 899, 1043, 1136, 1230],
    alt: 'Zenlot Insights screen with example data: 13 trades analysed over 90 days and a Critical card flagging a rule-breaking streak in 5 of 13 trades.',
    file: '08-insights.png',
    quality: 'hero',
    shows:
      'Journals → Insights tab. "13 trades analyzed over 90 days". Top priority card marked Critical: "Rule-breaking streak — Several trades in a row broke your plan. 5 consecutive trades with a major plan violation. Seen in 5 of 13 trades", followed by the evidence list of those trades (NZDCHF, USDJPY, GBPCAD...).',
  },
  'risk-profile': {
    rowEnds: [773, 844, 1065, 1312],
    figures: { accountBalance: 2064.48, accountCurrency: 'CAD', riskPerTradePct: 2 },
    alt: 'Zenlot Risk Profile screen with example data: account balance CAD 2,064.48, max risk per trade 2%, max portfolio exposure 5%, max daily drawdown 5%, max weekly drawdown 8%.',
    file: '06-risk-profile.png',
    quality: 'hero',
    shows:
      'Risk Profile settings: "Set your account balance and governance limits. These size your positions and check every trade." Fields: account balance, max risk per trade 2%, max portfolio exposure 5%, max daily drawdown 5% (Zenlot uses it to warn or block trades after losses reach this level for the day), max weekly drawdown 8%.',
  },
  'trading-rules': {
    rowEnds: [721, 863, 1064, 1283],
    alt: 'Zenlot Trading Rules screen with example data: default take profit 75 pips and stop loss 45 pips, with a toggle to show results in pips or account currency.',
    file: '02-trading-rules.png',
    quality: 'good',
    shows:
      'Trading Rules: save standard stop-loss and take-profit pip values that are suggested for every trade (example: TP 75 pips, SL 45 pips); toggle gain/loss display between pips and account currency.',
  },
  history: {
    rowEnds: [872, 1181],
    alt: 'Zenlot Trade History screen with example data: 36 trades with search, filters for wins and losses, and trade cards showing R:R, profit or loss, pips and notes.',
    file: '04-history.png',
    quality: 'good',
    shows:
      'Trade History (36 trades): search by symbol, status or journal content; quick filters All/Wins/Losses/Recent; trade cards with R:R, P/L, pips and status (open, reached S/L) plus the note attached to the trade ("Market in range").',
  },
  journal: {
    rowEnds: [795, 919, 1081, 1220],
    alt: 'Zenlot journal entry with example data titled Trading Plan, listing a written weekly plan and review notes.',
    file: '03-journal.png',
    quality: 'good',
    shows:
      'A journal entry titled "Trading Plan" with a written weekly plan: review last week\'s trades and mistakes, check why a stop was hit early (news or bad luck), plan for the week. Pin/archive/edit actions.',
  },
  'trade-entry': {
    rowEnds: [782, 1000],
    alt: 'Zenlot Enter Trade Details form with empty fields for currency pair, entry price, pip value, lot size, stop loss and take profit.',
    file: '01-trade-entry.png',
    quality: 'weak',
    shows:
      'Empty "Enter Trade Details" form: currency search, entry price, pip value, lot size, stop loss and take profit fields, Show Note / Confirm buttons. Fields are blank, so only use it to explain the workflow.',
  },
  analysis: {
    rowEnds: [897, 1042, 1170],
    alt: 'Zenlot home screen with example data: monthly pips and monthly analysis cards above an empty open-trades state.',
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
  return SCREEN_IDS.map((id) => {
    const f = SCREENS[id].figures;
    const figures = f
      ? ` EXAMPLE FIGURES ON SCREEN: account ${f.accountCurrency} ${f.accountBalance?.toLocaleString('en-US')}, ${f.riskPerTradePct}% risk per trade. A post showing this screen must use these figures in its worked example, or quote them on the screen slide ("Example account: ...").`
      : '';
    return `- "${id}" (${SCREENS[id].quality}): ${SCREENS[id].shows}${figures}`;
  }).join('\n');
}
