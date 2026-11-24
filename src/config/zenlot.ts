// ---------------------------------------------------------------------------
// Single source of truth for what Zenlot is, used by every content prompt.
// Sources: https://info.zenlot.net (checked 2026-11-18) and the founder (2026-11-22). Update this file when
// the product changes — every agent picks it up automatically.
// ---------------------------------------------------------------------------

export const ZENLOT_LINKS = {
  site: 'https://info.zenlot.net',
  appStore: 'https://apps.apple.com/us/app/zenlot/id6759946394',
  googlePlay: 'https://play.google.com/store/apps/details?id=com.zenlot.app',
  instagram: 'https://www.instagram.com/zenlot_app/',
  // Link in the Instagram bio (zenlot-info.github.io/ig): tags store installs with the fixed campaign "instagram".
  instagramBio: 'https://info.zenlot.net/ig',
} as const;

export const ZENLOT_PRODUCT = `
Zenlot is a free forex trading journal app for iOS and Android, in English, French and Spanish.
Tagline: "Build discipline. Trade by your rules." It helps traders plan, record and review trades
against their own rules. It is for every experience level: beginners building a recording habit,
traders working on consistency, and experienced traders who want a mobile review process.

What it does:
- Reusable rules: save up to 3 standard stop-loss and take-profit pip values; Zenlot suggests levels when
  you log a trade. Gain/loss can be shown in pips or account currency.
- Risk profiles (Prudent, Balanced, Dynamic) and an optional trading plan.
- Risk Profile settings: account balance, max risk per trade %, max portfolio exposure %, max daily
  and weekly drawdown %. These size positions and check every trade; once the daily loss limit is
  reached, Zenlot warns or blocks new trade entries in the app.
- Pre-trade checklist shown before confirming a trade.
- Position & Governance: shows the recommended lot size, capital exposure and reward-to-risk for the
  trade against your risk profile, and warns when a trade falls outside it.
- Journal notes: your written reasoning stored with each trade.
- Trade verdicts on every closed trade: R-multiple, setup-quality grade and plan-adherence grade.
- Behavioural Insights: after 10 evaluated trades, flags recurring habits with supporting evidence.
- Trade history searchable by pair, execution type, status or journal content, with quick filters
  (wins, losses, recent, this week), plus weekly and monthly pip-based analysis.
- Verdicts can label a winning trade "Lucky" when the process score was poor ("You won, but this was
  luck, not process"), with coaching on what to focus on next.
- Tracked trades can close automatically in the app when stop-loss or take-profit is reached (record only).

What it does NOT do (never claim otherwise):
- It does not connect to brokers or place, modify or close real orders.
- It does not control your broker account. Its limits act inside the app: it recommends, warns,
  records, and can block new entries in Zenlot after your daily loss limit. Don't call it "enforcement".
- It is forex only (currency pairs, pips, lots).
- It gives no financial advice or trade recommendations and does not guarantee results.

Founder story (told by the founder, 2026-11-22). Use ONLY these facts; never add details such as
account sizes, blown accounts, specific trades, years or numbers that are not written here:
- While trading, the founder noticed he made more errors when he wasn't following his rules and
  process than when he was.
- He needed somewhere to write down his experience, his mistakes and what he noticed in the market,
  so he wouldn't make the same mistake twice.
- Zenlot started as an Excel sheet. Over the weeks and months it kept evolving until it became Zenlot.
- The spreadsheet had limits: he couldn't add features, couldn't easily journal a trade unless he was
  at his laptop, and had to maintain it by hand (creating new sheets and copying the previous table over).
- Zenlot solved those problems. What he loves most: before entering a trade he can see roughly how
  much he stands to gain or lose, and tell easily whether it's a good or a bad trade.
The purpose in one line: Zenlot was built to help traders improve discipline and trade by their rules.

Coming next (in development, NOT available yet): a feature that spots setups matching your own written
rules, plus general enhancements. You may say "we're working on spotting setups that match your own rules" in
founder or community posts, but never describe how it works, give dates, present it as available, or call it
"opportunity detection", "signals" or "alerts" (those read like a signals service).

Audience: forex traders around the world, not one country. Vary currency pairs (majors, crosses and
the occasional exotic), don't assume a USD account (say pip value depends on account currency),
write times in UTC, and avoid region-specific slang, holidays or date formats.

Messaging that fits the product: "Judge the process, not just the outcome." "A record you can actually
learn from." "Patterns you can act on." "One routine you can repeat." It is currently free — say
"free on iOS and Android" rather than inventing plans, trials or prices.
`.trim();
