# X and Reddit agents

Four scheduled jobs draft posts and replies (`.github/workflows/agent-cron.yml`). Nothing runs for real until the
`AGENTS_LIVE` repository variable is `true`.

## What gets posted

| Draft | Goes out automatically? |
|---|---|
| Reply to someone's post (X or Reddit) | **Never.** X bans automated replies to keyword searches. Every reply waits for you. |
| Original X post or Reddit post | Only if `AGENTS_AUTOPOST=true` **and** it passes the brand check. Otherwise it waits for you. |

Original posts get a "Not financial advice." line if they don't have one. An X post with no room for it is held.

## The daily email

Held drafts collect in `content/outbox/queue.json`. At 15:00 UTC you get **one email with the best 5**, each with
the original post quoted, and the queue is cleared. Drafts that failed the brand check rank last. Drafts older than
48 hours are dropped as stale.

## The brand check (`src/content/brand-guard.ts`)

Blocks, on every channel:

- overclaims ("enforces", "connects to your broker")
- promised results
- signals talk
- invented testimonials, trading history or statistics ("90% of traders…")
- market calls ("about to break out", "price target")
- calling the roadmap "opportunity detection"

Replies that name Zenlot must also say we built it ("I built Zenlot…").

## Reddit

- At most **one new post a week** (Wednesday UTC), and only once the account has **200+ comment karma** from
  helpful replies. Before that, it only drafts replies.
- Subreddits: r/Forex, r/Daytrading, r/algotrading, r/FXtraders, r/TradingView, r/Forex_Trading. r/investing,
  r/personalfinance and r/StockMarket were dropped: off-topic for forex and hostile to promotion.

## X replies to other accounts

The engager only looks at accounts in `content/x-targets.json` that you've vetted in the last 90 days. Set
`vettedAt` to the date you checked. An account qualifies if it posts education, with **no** signals or paid groups,
**no** broker referral (IB) links, and **no** profit screenshots. It picks 3 a day, rotating. Until you vet any, it
does nothing.
