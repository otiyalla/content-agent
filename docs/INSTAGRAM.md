# Instagram engine

Plans, designs and publishes Zenlot's Instagram feed every week.

```
Sunday 16:00 UTC ─ planner ──► pulls insights on recent posts (what got saved/shared)
                              ► emails last week's report on its own, so it arrives even if planning fails
                              ► Claude Opus 5.5 plans 5 posts for next week
                              ► saves content/instagram/calendar/<week>.json (committed)
                              ► renders every slide, emails the full preview

Mon–Thu + Sat 13:07 ─ publisher ──► renders the post from the calendar JSON
                                       ► uploads JPEGs to Cloudflare R2
                                       ► publishes via the Instagram API, records permalink
18:07 daily ─ retry for anything that failed
:37 at 13–16, 19, 22 UTC ─ comment digest: new comments + drafted replies by email (docs/COMMUNITY.md)

Every publisher run also freezes each post's insights at 48 hours and 7 days (follows, profile visits,
link-in-bio taps, reach, saves, shares) and records the follower count in
content/instagram/account-history.json. Sunday's report stores the week's profile views, link-in-bio taps and reach in
account-metrics.json. The planner ranks posts by follows per 1,000 reach at 48 hours,
and only once about 10 posts are measured.
```

**Posting schedule** (`src/instagram/calendar.ts` → `WEEKLY_SLOTS`), all at 13:00 UTC, each a named series shown as the cover kicker:

| Day | Format | Series | Pillar |
|---|---|---|---|
| Mon | carousel | Survival Maths | risk maths |
| Tue | single | Pre-Trade Check | process / myth-busting |
| Wed | carousel | Inside Zenlot / From the Founder | the week's only Zenlot post, alternating |
| Thu | single | Trader's Mind | psychology (often a hypothetical scenario) |
| Sat | carousel | Weekend Review | journaling and weekly review |

Until the account has 1,000 followers, at least 2 of the 5 posts ask people to follow, naming the series.
The steps only a person can do are in [FIRST-FOLLOWERS.md](FIRST-FOLLOWERS.md).

Year-end and new-year weeks get seasonal guidance automatically (`src/instagram/seasonal.ts`). Weeks with a US jobs
report or Fed decision get a dated risk note (`src/instagram/events.ts`), never a market view. A post that gives the
wrong date, or a market view in wording the check knows, is held, also after a hand edit; your approval is still the
real check. The dates are a fixed list: compare them with the official pages when an event week comes up. They run
to November and December 2027; the plan email says when to add more.

## Reviewing and vetoing posts

The Sunday email shows every slide and caption. Posts then go out automatically. To change anything,
edit `content/instagram/calendar/<week>.json` on GitHub (the email links straight to it):

| You want to | Do this |
|---|---|
| Stop a post | set `"status": "skipped"` |
| Release a held post | the planner saves a post that breaks a brand, maths or advice rule as `skipped`, with the reason in `held`. Fix it, then set `"status": "scheduled"`. You'll get a fresh preview and it waits 3 hours |
| Fix a typo / reword | edit `slides[].title`, `body`, `items`, or `caption`. You'll get a fresh preview email and the post waits 3 hours before publishing |
| Move a post | change `scheduledAt` (ISO time, UTC) |
| Steer next week | run the workflow manually with **notes**, e.g. "NFP is Friday". On a Monday also tick **force**: a Monday run otherwise means the week that has just begun, and force never overwrites that week |
| Re-plan a week | run the workflow manually with **force** ticked |

Use `**double asterisks**` in slide text to highlight words in teal.

## Running locally

```bash
npm run ig:preview                 # render the built-in sample posts → out/instagram/sample
npm run ig:preview -- 2026-W48     # render a saved week
npm run ig:plan                    # plan next week (DRY_RUN=true writes the email to out/…/preview.html)
DRY_RUN=true npm run ig:publish -- --now 2026-11-23T13:07:00Z   # simulate a publish run
```

## One-time setup

### 1. Instagram account + Meta app (≈20 min)

Meta now sets new apps up with **Instagram API with Unified Login**. It gives a system-user token that
**never expires**, and calls go to `graph.facebook.com`. The code detects the token type automatically.
Older Instagram Login tokens (`IG…`, 60 days) still work too.

1. Make sure @zenlot_app is a **public Professional** account (Business or Creator).
2. <https://developers.facebook.com/apps> → **Create App** → use case: under **Content management**, choose
   **Manage messaging & content on Instagram** → finish the wizard.
3. In the use case, open **API setup with Unified login**. Connect a **business portfolio** (create one named "Zenlot" if needed).
4. **Roles:** add @zenlot_app with the **Instagram Tester** role, then accept the invite at
   instagram.com/accounts/manage_access/ → **Tester invites**.
5. **Step 1 – Configure your app:** **Create new configuration** with asset @zenlot_app and permissions
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`.
   If `instagram_manage_insights` is missing, add it first under **Permissions and features**.
   Select the configuration and save `https://info.zenlot.net/` as the redirect URL (it isn't used).
6. **Step 2 – Generate access tokens:** **Generate token** next to zenlot_app. Put it in `.env` as `IG_ACCESS_TOKEN`,
   and the number under the account name as `IG_USER_ID`.
7. Check it with `npm run ig:whoami`. It shows the account, the API host, and whether publishing is allowed.

Skip webhooks, business login and App Review. They're only needed to manage other people's accounts.

### 2. Cloudflare R2 (≈5 min)

1. Cloudflare dashboard → **R2** → **Create bucket** → name `zenlot-social`.
2. Bucket → **Settings → Public access**: either connect a custom domain (e.g. `social.zenlot.net`, recommended)
   or enable the `r2.dev` subdomain. Note the public URL.
3. R2 → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, scoped to `zenlot-social`.
   Note the **Access Key ID**, **Secret Access Key**, and your **Account ID**.

### 3. GitHub repository settings

**Settings → Secrets and variables → Actions**

Secrets:

| Name | Value |
|---|---|
| `IG_USER_ID` | Instagram user ID from step 1 |
| `IG_ACCESS_TOKEN` | Instagram token from step 1 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | from step 2 |
| `GH_SECRETS_TOKEN` | *(only for 60-day `IG…` tokens)* fine-grained PAT with **Secrets: Read and write** so the workflow can refresh the token weekly. Not needed for Unified Login system-user tokens, which never expire. |
| `SAFETY_BACKUP_EMAIL` | *(optional)* also gets the comment digest while `OWNER_AWAY` is `true` |
| `RADAR_COMPETITOR_NAMES` | *(optional)* comma-separated names kept out of saved plans |
| `XAI_API_KEY` | xAI Grok key, the second backup LLM (from console.x.ai) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SMTP_*`, `EMAIL_*` | already used by the other agents |

Variables:

| Name | Value |
|---|---|
| `R2_PUBLIC_BASE_URL` | e.g. `https://social.zenlot.net` |
| `R2_BUCKET` | `zenlot-social` |
| `IG_HANDLE` | the account handle shown on every slide, e.g. `@zenlot_app` |
| `OWNER_AWAY` | `true` while you're away: nothing publishes, the comment digest continues ([INCIDENTS.md](INCIDENTS.md)) |
| `IG_LIVE` | `true` to actually publish. **Leave unset until you've reviewed a dry run.** |

### 4. Go live

Follow [GO-LIVE.md](GO-LIVE.md): run the `golive-check` job, clear every ❌, record the manual steps in
`content/go-live.json`, then set the `IG_LIVE` variable to `true`.

## LLM failover

Every agent uses the same chain (`src/services/llm-providers.ts`): **Claude → OpenAI → xAI Grok**.
Providers without a key are skipped. Each hop is logged as `[LLM_FALLBACK]` in the Action logs.
The Instagram planner uses Claude Opus 5.5 with schema-enforced output; backups return JSON that is
validated against the same schema before it is accepted.

Product facts used by every prompt live in `src/config/zenlot.ts` (from info.zenlot.net). Update it when the app changes.

## Costs

- Claude Opus 5.5: one planning call per week (~3k in / ~10k out tokens): well under $1/month.
- R2: free tier (10 GB storage, no egress fees). About 25 images/week ≈ 5 MB.
- GitHub Actions: about 22 short runs/week.
