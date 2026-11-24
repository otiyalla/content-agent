# TRD: Growth Radar

| | |
|---|---|
| Status | v2. T0 is built on branch `feat/radar-t0` (not merged; T0.6 partly open, see 14.2). Nothing else is built. |
| Date | 24 November 2026 (UTC) |
| Baseline | Review: `main` at `695a800`. T0: `4fa67cc` |
| Reviewed by | Content Creator, Instagram Curator, Growth Hacker and Social Media Strategist agents: two rounds each, then reconciled ([section 19](#19-review-record)) |
| Decisions needed | [Section 15](#15-decisions-for-the-owner). D1, D2, D6 and D9 block the Radar build (T1). T0 can start now. |

**Evidence labels.** **[code]** read in this repository. **[tested]** called live on 24 Nov 2026, read-only.
**[docs]** the platform's own documentation. **[press]** secondary sources only. **[calc]** arithmetic, reproducible.
**[estimate]** our guess at effort or cost. **[judgement]** a threshold or rule chosen by reasoning, with no data behind it yet.

---

## 1. Summary

Growth Radar is a read-only job that finds people, conversations and patterns worth a person's 15 minutes. It suggests;
a person decides and posts. This version spends little before evidence and builds in paid-for steps (tranches).

| You asked for | What you get | When |
|---|---|---|
| Identify relevant creators | A safety-gated queue to vet, from your seeds, in-app search and people who already interact with Zenlot | T1 |
| Discover trending discussions | First: real reader questions. Later: counted topics among watched accounts, with evidence thresholds | T0 by hand, T2 |
| Suggest personalized comments | Up to 2 fresh posts a day, each with one specific angle; then one draft you can edit | T1 angle, T2 draft |
| Identify collaboration opportunities | A worksheet and rules now; a shortlist once creators have actually replied | Manual now, T3 |
| Track competitor content performance | A monthly table for 6–8 competitors, own history first | T2, can be funded separately |

Six findings shape the design:

1. **Instagram can start now.** The existing token reads other professional accounts' profile, followers, captions, likes,
   comment counts and Reel views **[tested]**. Hashtag search and other people's comment text are refused **[tested]**.
2. **Nobody knows yet whether comments from a 4-follower account earn replies.** A hand pilot (up to four weeks) costs no code and
   answers it. All four reviewers asked for it. That agreement is not evidence that comments work; it says the question is cheap.
3. **Zenlot was missing from the EU App Store during the review, and is back.** Apple returned nothing in eight of eight EU stores checked
   earlier on 24 November; at 05:40 UTC it returned a listing and a live page in all 27 **[tested]**. Still open: Apple reports English only and 0 ratings.
   The gap shows why a market check belongs here.
4. **Reddit should not be built on.** New API requests closed on 31 October 2026 and public access ends in March 2027 **[press]**.
5. **The repository is public**, including logs and artifacts, so third-party data needs private storage.
6. **Small samples lie.** With about 20 accounts, the v1 "rising topic" rule and 0–100 scores would mostly rank noise, so they are gone.

**Recommendation:** do T0 (4 days) and the pilot now; fund T1 only if the pilot passes. The competitor table does not depend on
comments working, so it may be funded on its own (D9).

## 2. Goals, non-goals, success

### 2.1 Goals

- G1. Cut the time spent *finding* posts, so 15 minutes goes on reading and replying.
- G2. Turn real reader questions, then competitor evidence, into better Instagram plans.
- G3. Keep every safety rule already in place, and close the gaps in section 3.2.
- G4. Record what was done and what came of it, so decisions rest on outcomes rather than on suggestions accepted.
- G5. Notice people who already mention, tag or answer Zenlot before looking for strangers.

### 2.2 Non-goals

- Posting, liking, following, commenting or messaging automatically, on any platform.
- Scraping, browser automation, logged-in sessions, or data vendors that scrape.
- Publishing a ranking of creators, selling data, or building profiles of private people.
- Paid sponsorship management, affiliate payouts, ad targeting.
- Copying competitor posts. Radar reports patterns, and drafts must not reuse their wording (FR-COM-7).

### 2.3 Success, and when to stop

**North star:** newly activated traders a week. It needs a server definition (a candidate: 3 trades with a verdict and one note within
14 days) that nobody has checked, so it is *reported when available* and gates nothing.

**Funnel** (store what exists; never fill gaps with guesses):

| Step | Source | Limit |
|---|---|---|
| Comment or pitch done | `action` log | Owner-entered |
| Creator replied | `outcome` log, checked once at 48–72 h | Owner-entered; `unknown` is never "no" |
| Profile visit | Account insight `profile_views` **[tested: 3 in 7 days]** | Account-wide; can't be tied to a comment |
| New follow, by likely source | Weekly hand tally, stop at 100 followers | Counts only, "consistent with", no list of people |
| Bio-link tap | Account insight `website_clicks` **[tested]** | Not `profile_links_taps` (R13) |
| Store visit, install | Store consoles | Hidden below store thresholds **[docs, via review]** |
| Activated | Server | Not defined yet |

**Headline measure:** `creator reply rate = comments with creator_replied = yes ÷ comments with creator_replied = yes or no`, denominator always shown. Invites and pitches are
reported separately. The 40-comment check counts only comments with a `suggestion_id`. Likes are shown beside it, never added.
If unknown ÷ all comments checked is over 25%, print no rate. All thresholds below are operating rules, **not** significance claims **[judgement]**.

| When | Stop or pause | Continue | Next tranche |
|---|---|---|---|
| Pilot (section 14.1) | Gate fails | Extend once | T1 comments |
| 40 Radar-found comments with known results | Replies < 10% (0–3), **or** find + write > 4 min a comment | Anything else: 4 more weeks, once; then hold T1 as it is unless the last column is met on all known results | Replies ≥ 20% (8+) **and** find + write ≤ 4 min |
| 4 ordinary weeks, under 40 known results | Under 20: "too small", extend 2 weeks once, then stop on effort | 20–39: continue to 40, at most 10 ordinary weeks in all, then stop on effort if still short | Not yet |
| Any time | Unsafe comment posted, Meta warning or action block: pause (FR-SAF-6). Two idle weeks: pause | | |

Ordinary weeks leave out 21 December to 3 January. Follower change is reported without a target. Other checks: unsafe suggestion shown = defect,
fix before the next run; automated outbound actions = 0; missed runs ≤ 1 in 10 weekdays.

Why not an on/off experiment: at about 5 comments a week and 3 profile visits, alternating weeks could not detect a
plausible effect **[calc, review]**. Revisit at 30 profile visits a week.

## 3. Project review

### 3.1 What exists and will be reused

| Component | Where | Use in Radar |
|---|---|---|
| Product facts | `src/config/zenlot.ts` | Every prompt |
| Copy rules | `src/content/brand-guard.ts` (`lintCopy`, `lintReply`) | Every draft |
| Reply playbook, red flags | `src/content/community-playbook.ts` | Distress, scam and impersonation handling |
| Provider chain | `src/services/llm-providers.ts` | Extended with a structured call |
| Structured output + refusal fallback | `src/instagram/strategist.ts` (`planWithClaude`, `backupPlanSteps`) | Extracted into that shared call |
| Fixed-age snapshots | `src/instagram/insights.ts` | Same principle for other accounts |
| HTML digest + dry run to disk | `src/services/email.service.ts` | Daily and weekly emails |
| Cloudflare cron → `workflow_dispatch` | `cron-trigger/` | Scheduling |
| Vetting rule (90 days) | `content/x-targets.json`, `community-engager.ts` | Generalised, moved to private storage |
| Go-live gate | `src/workflows/golive-check.ts` | Extended with Radar checks |

`npm run typecheck` passes. There are no automated tests.

### 3.2 Problems found

| # | Severity | Finding | Evidence | Action |
|---|---|---|---|---|
| R1 | High | `LLMService.parseJson` loses lists of objects: `[{…},{…}]` returns `[]`; a one-item list returns a bare object. So `synthesizeFeedback` drops multi-theme results and crashes on a single one. | `llm.service.ts` `parseJson`; reproduced | Fix in T0 |
| R2 | High | Repo is public and `agent-cron.yml` logs post excerpts, authors and drafts. `content/outbox/queue.json` would be committed publicly when live. | `gh repo view`, workflow | D1; never log third-party text |
| R3 | High | Reddit agents have no credentials and the API is closing. | `.env` key names, `gh secret list`, **[press]** | D5: retire or pause |
| R4 | Medium | `content/go-live.json` publishes a personal email address. Removing it leaves it in git history. | file | Owner decides |
| R5 | Medium | X, Reddit and Tavily secrets are not in GitHub. `sync-github-secrets.sh --agents` omits `TWITTER_BEARER_TOKEN`, and the workflow doesn't pass it. | script, workflow | Fix only if D3 is yes |
| R6 | Medium | X cost (only if those agents go live). The hunter makes ~11 searches twice a day, requesting 10 posts each (it keeps 3): up to 220 reads/day ≈ $1.10/day ≈ $33/month at $0.005, before daily deduplication. Posts containing a URL cost $0.20 each, and about half of three post types add an Instagram link. `DRY_RUN` stops writes, not paid reads. | `pain-point-hunter.ts`, `content-creator.ts`; X pricing **[docs]** | Keep `AGENTS_LIVE` off for the hunter unless funded with a spend cap |
| R7 | Medium | No memory across days: the digest clears the queue, so the same post can be drafted again, and nothing records what was used. | `outbox.service.ts` | `suggestion` and `decision` tables |
| R8 | Medium | The engager only ever gets post text. The author's followers are optional and unused; Reddit passes **upvotes** as followers. | `community-engager.ts`, `reddit-community.ts` | Radar uses real metrics |
| R9 | Low | JSON mode asks OpenAI/Grok for an *object* where the prompts want a *list* (`triageComments`, `synthesizeFeedback`, `generateSearchQueries`). | `llm-providers.ts` | Wrap lists in an object |
| R10 | Low | The hunter stops at 5 replies, so feature requests ranked below are never collected. Comments say "expanded by Claude" even though the first model may not be the one that answered. | `pain-point-hunter.ts` | Fix if kept |
| R11 | Low | No branch protection and no CI checks on pull requests. | GitHub API | Add CI in T0 |
| R12 | Info | GitHub schedules fired again on 24 Nov (3 runs), after none since 8 Aug. Jobs can now start twice. | `gh run list` | Runs must be idempotent (NFR-2) |
| R13 | Medium | The Sunday email labels `profile_links_taps` "link-in-bio taps". Meta describes it as address, call, email and text taps; the bio link is `website_clicks`. Both are fetched but not stored. | `instagram-planner.ts:67` **[code]**, descriptions **[tested]** | T0 |
| R14 | High | `redFlags()` has no distress pattern, and when every model fails `triage` returns `[]`, so a distressed comment is not marked urgent. | `community-playbook.ts`, `instagram-comments.ts` **[code]** | T0 |
| R15 | Medium | The comment digest reads only the last 10 posts and never reads tags. | `RECENT_POSTS = 10` **[code]** | T0 |
| R16 | Medium | The calendar stores free-text `topic`, `theme` and `rationale` publicly, so own topics can't be joined to anything, and competitor insight could leak there. | `types.ts` **[code]** | T0, T3 |
| R17 | Medium | X's bio uses the same `/ig` link as Instagram, so X traffic is counted as Instagram. The weekly campaign name also splits tiny volumes. | `PROFILE.md` **[code]** | T0 |
| R18 | High | `zenlot.ts` says free on iOS and Android in English, French and Spanish; the App Store reports English only. EU availability is resolved (finding 3). | **[tested]** | Owner, D10 |
| R19 | Low | `FIRST-FOLLOWERS.md` asks for 3 comments a day; this document caps at 2. | **[code]** | Align after the pilot |

## 4. Platform capability and policy

### 4.1 What each source can do

| | Instagram | Web (Tavily) | X | YouTube | Reddit |
|---|---|---|---|---|---|
| Creators | Validate and measure a **known** handle; people who tag or comment on us | Not used in v1 | Search authors | Search channels | No |
| Discussions | Watched accounts' captions; comment **counts** only | Articles, context | 7-day recent search | Titles, descriptions, comments | No |
| Comment drafts | Yes, posted in app | — | Yes, posted in app | Yes, posted in app | Manual paste only |
| Competitor metrics | Likes, comments, Reel views, followers | — | Not by default (4.2) | Raw display ≤ 30 days, no scores | No |
| Not available | Hashtags (until App Review), reach, saves, shares, others' comment text | | | | |
| Access today | Works **[tested]** | Key works **[tested]** | Keys in `.env`; not tested (paid) | No key | Closed **[press]** |
| Cost | Free | 1,000 free credits/month; $0.008 after **[docs]** | $0.005/post, $0.010/user **[docs]** | Free: 100 searches + 10,000 units/day **[docs]** | — |
| Phase | T0–T3 | Parked | Parked | Parked | Excluded |

### 4.2 Rules the code must enforce

| Platform | Rule | Design consequence |
|---|---|---|
| Instagram | `business_discovery` covers professional accounts; age-gated ones are not returned **[docs]** | `unavailable` is normal, not an error |
| Instagram | Uses Platform Rate Limits, 200 × daily users per hour, reported in `X-App-Usage` **[docs]** | Cap 40 calls a run; stop when any usage header reaches 40%, leaving room to publish. About 1% a call at 50 posts each **[tested]** |
| Instagram | Meta Platform Terms bar building user profiles without consent, surveillance, and selling data **[docs]** | Keep account/post metrics only. No personal attributes, sentiment about a person, or automatic cross-platform identity. Owner review needed: D6 |
| Instagram | API cannot comment on media found by hashtag; we have no outbound path to others' posts | Manual posting only |
| X | Keyword-triggered replies and automated likes are banned; replies need the user to engage first **[docs]** | No X write client is imported by Radar |
| X | No training on X content; no surveillance or tracking of users; analysis needs an approved use case **[docs]** | No X competitor history. Declare the use case before any X work |
| X | Matching to off-X identity needs consent or public/self-provided data **[docs]** | Links between platforms are entered by a person, from a public link |
| X | Remove deleted or protected posts within 24 h of a request **[docs]** | 7-day text retention; re-fetch before showing anything over 24 h old |
| YouTube | No new derived metrics; no aggregation across channel owners; public statistics ≤ 30 days **[docs]** | Own tables with a hard 30-day purge; excluded from scores; sorted by date or raw views |
| YouTube | API clients need a privacy policy and YouTube terms link **[docs]** | Checklist item if YouTube is ever revived |
| Reddit | Approval required; commercial use needs written agreement **[press]** | No collection, including Reddit results in web search (domain blocked) |
| Web | Search snippets may contain platform content | Used only to extract a handle, then discarded. Never stored, never sent to a model |

Reddit's dates come from press coverage of its 30 September 2026 announcement; Reddit's own pages refused automated
reading, so confirm them before D5.

### 4.3 What `business_discovery` really returns

Checked on 12 readable accounts of 20 tried, 501 posts (`npm run ig:fields`, counts only) **[tested]**. The handles were ours, not the owner's list. Fields not listed are unknown until tested; request nothing undocumented.

| Field | Result | Rule |
|---|---|---|
| `caption`, `timestamp`, `permalink`, `media_type`, `media_product_type`, `comments_count` | Present | Use. `shortcode` is parsed from `permalink` |
| `like_count` | 475 of 501. All 26 missing are one competitor's (1 of 11 accounts with posts hides over 20%) | Missing = hidden. Never 0, never worked around |
| `view_count` | 201 of 228 Reels, no feed posts | Reels only, and not all; may mix paid, organic and cross-posted views **[docs, via review]** |
| `reposts_count`, `total_comments_count` | 501 of 501 | Optional |
| `total_like_count` | 475 of 501, hidden exactly when likes are; differs from `like_count` on 15 posts | Optional. Never a way round hidden likes |
| `children{media_type}` | 110 of 501 | Slide count where present; nothing about content |
| `@mentions` in captions | **0 of 501** captions, including accounts that routinely credit people | Stripped. Mention-based discovery is impossible |
| `alt_text`, `media_audio_type`, `is_comment_enabled`, `is_shared_to_feed`, `total_views_count`, comments' text | Refused (400) | Never request |
| Unknown or non-professional handle | Error 110 | `unavailable` (8 of 20 handles tried; some were guesses) |
| `biography`, `website` | 12 and 10 of 12 accounts | FR-REG-7 can use them |
| Own `/tags` | 200, empty | Works; use for listening |
| Own `/collaborative_media`, `/collaboration_invites` | 200, empty | Readable; nothing to see until we have a Collab |
| Collab duplicates, trial Reels, pinned order | Not seen in 501 posts (0 accounts out of date order) | Still unproven; sort by `timestamp` anyway |
| Usage | 20 accounts × 50 posts took the header from about 13% to 34% | About **1% a call** at this size, so 25 accounts use roughly a quarter and the 40% stop bites near 40 calls |

### 4.4 Channels after Reddit

At most **1 read source (Instagram)** and **2 hand channels** active; opening another closes one. Fit is **[judgement]**; API limits were read by the reviewing agent from the platforms' docs.

| Channel | Decision now |
|---|---|
| LinkedIn, founder's own account | By hand, one story a week, warm network. No usable read API for this purpose |
| Telegram, founder, 2–3 admin-approved groups | By hand under `FIRST-FOLLOWERS.md` rules. Never a listening bot |
| Podcasts and newsletters | By hand, founder email, inside the 2-a-month pitch limit |
| Threads, Bluesky, TikTok | Claim the name to prevent impersonation; park |
| X, YouTube, Instagram hashtags, web discovery | Parked. Reopen only with a named use, budget and policy check |
| Discord | No server under 500 followers |

## 5. How it works

```
 Cloudflare cron, weekdays, 30 min before the owner's window
        │ workflow_dispatch (GitHub's own schedule as a duplicate-safe backup)
        ▼
 GitHub Actions: radar.yml ───────────────────────────────────────────────
  1 purge      retention deletes first, always
  2 collect    ≤ 40 GET calls: latest 25 posts per account (50 on first fetch), sorted by timestamp
               (pins make position meaningless); competitors weekly; re-run gates
  3 classify   new captions (section 9)                              [LLM]
  4 shortlist  eligibility + sort (no scores)                        [code]
  5 angle      one angle per post; one draft in T2                   [LLM]
  6 report     email only if something qualifies; monthly table in T2
        │                                   ▲ decisions and outcomes (CLI)
        ▼                                   │
 Cloudflare D1 (private) ◄──────────────────┘
 Pilot: the owner's private sheet with the same columns. No code.
```

Choices and reasons:

| Choice | Why | Rejected |
|---|---|---|
| GitHub Actions runtime | Already there; jobs take minutes | Workers: sub-request and CPU limits complicate LLM work |
| D1 for state | Private, SQL joins, retention deletes, tiny data; account already on Cloudflare. Free: 500 MB per database **[docs]** | JSON in git (public, can't truly delete). The R2 bucket (has a public domain) |
| Local store: `node:sqlite` | Same SQL dialect as D1, so tests run offline | Postgres: more to run |
| Gates and a visible sort, LLM only for reading and writing | Explainable; honest with 25 accounts | 0–100 scores, learned weights, LLM "score 1–10" |
| Scheduled, not run by hand | You asked for automation; works when the laptop is off | Local on-demand with SQLite (Content Creator's proposal): less to build and nothing public, but not unattended. Falls back to this if D1 is rejected |
| Code decides the workflow; the model has no tools | Input is untrusted; nothing to hijack | Autonomous agent |
| Separate `radar` concurrency group | Must never delay publishing | Sharing the `instagram` group |

### 5.1 Scheduling

- One weekday run at `RADAR_WINDOW_UTC − 30 min`; default window 15:00, so 14:30 UTC, between the 14:07 and 18:07 publisher runs.
  Comments lose value as threads settle, so a 06:23 run over 48-hour-old posts was the wrong design.
- Fixed UTC times, so the owner moves the window when clocks change. No email when nothing qualifies, except Friday's weekly lines.
- The Workers Free plan allows 5 cron triggers per account **[docs]**; this Worker uses 3. Check the rest of the account before deploying.
- `cron-trigger` knows one workflow today. Change `CRONS` values to `{ workflow, job }`; keep existing entries.
- Dead-man check: the 22:37 comments run warns if there was no successful Radar `run` on the last weekday (the step gets the D1 token; if the check fails, the digest still goes out).

### 5.2 Code layout

```
src/radar/
  types.ts            domain types and zod schemas
  config.ts           thresholds, weights, limits (one file, no magic numbers elsewhere)
  store/              store.ts (interface) d1.ts sqlite.ts migrations/0001_init.sql
  sources/            source.ts (interface) instagram.ts
  gates.ts  classify.ts  shortlist.ts  angle.ts  [draft.ts verify.ts in T2]
  report/{daily,monthly}.ts  purge.ts
  taxonomy.ts         topics, substance, bait, safety flags
  prompts/            one file per prompt, with a version constant
src/services/llm-structured.ts     runStructured() shared with the strategist
src/workflows/radar.ts             CLI entry
test/radar/**                      node:test + fixtures
.github/workflows/{radar,ci}.yml
```

```ts
interface Source {
  id: 'instagram';
  /** false = skipped with a reason, never a crash */
  ready(): { ok: true } | { ok: false; reason: string };
  fetchAccount?(handle: string, budget: Budget): Promise<AccountFetch>;   // ok | unavailable | rate_limited | error
  fetchOwnTags?(budget: Budget): Promise<TaggedPost[]>;
}
```

`Source` has **no write method**. Radar must not import `twitter.service`, `reddit.service`, or any publishing function;
the Instagram source is a separate GET-only client (AC-1).

## 6. Functional requirements

### 6.1 Account registry (FR-REG)

- FR-REG-1. An account has roles (`creator`, `competitor`, `own`) and a status: `candidate`, `vetted`, `rejected`, `paused`, `unavailable`.
- FR-REG-2. Only a person can set `vetted` or restore `paused`. Vetting lasts 90 days.
- FR-REG-3. Checklist, all answered: no signals or paid group; no broker referral links; no profit screenshots or lifestyle flexing; educates;
  real audience; not impersonating anyone; every link behind a link page opened by hand (gates can't see it).
- FR-REG-4. `rejected` keeps only platform, keyed handle hash, reason code and date.
- FR-REG-5. Seeds come from `radar add`, or one import of `x-targets.json` as unvetted. No seed list is committed.
- FR-REG-6. Competitors: 6–8, entered by hand. Include the **free mobile journals next to Zenlot in the stores**, not only the paid desktop
  names. Tiers: `direct`, `adjacent`, `aspirational`. The list stays private; check each handle with `npm run ig:fields`.
- FR-REG-7. Every fetch, and again just before display, re-runs the deterministic gates on bio, link and new captions. A hit sets `paused`,
  withdraws open suggestions, flags any open collaboration and adds one email line.
- FR-REG-8. Start at 25 watched accounts (about 15 creators, 6–8 competitors, own); hard cap 40.

### 6.2 Creator discovery (FR-CRE)

- FR-CRE-1. Sources: (a) owner seeds; (b) Instagram's own in-app search and "similar accounts", by hand; (c) people who comment on or tag us, when the
  owner promotes one. Automated web and mention discovery are **out**: 0 of 10 web results showed a handle, and mentions are stripped (4.3).
- FR-CRE-2. So this is *assisted*, not autonomous, discovery: the owner supplies a handle; Radar reads, gates and explains it. State this in the UI.
- FR-CRE-3. Show, don't score: followers, posts per week, last post, share of posts on our topics, median comments, hidden-like share, bait share, flags,
  two short captions. Sort by gates passed → topic share → recent activity. Prefer 500–25k followers; the owner may override.
- FR-CRE-4. Hard gates (deterministic, EN/FR/ES, model cannot override): signals or paid group, broker referral, guaranteed returns, account
  management, fund recovery, "DM me" selling, Zenlot impersonation, adult or hateful content. The model may add flags, never remove them.
- FR-CRE-5. At most 5 candidates in the email a week. Images aren't collected, so screenshot checks rest on the person.
- FR-CRE-6. Supply: `weekly supply = Σ over vetted creators of min(1, eligible posts in the week)`. One comment per creator per week means 10 creators at 50%
  give 5 a week **[calc]**. `RADAR_COMMENTS` can't be enabled below an expected supply of 5.

### 6.3 Questions, then trends (FR-TRD)

- FR-TRD-1. **Question log first.** Anonymised, paraphrased reader questions from our comments, invitations, and answers given to us: paraphrase, topic,
  source type, count, date. No handles or quotes. Kept by the owner privately from T0; needs no baseline and outranks trends.
- FR-TRD-2. Taxonomy: 8 topics at T0 for our own posts, up to 14 by T2, each with a definition, two examples and a near-miss. Versioned. Separate facets:
  topic, substance, bait, language, caption opening (not "hook": covers and first frames can't be seen).
- FR-TRD-3. In T2, monthly **counts**: posts, accounts and median comments by topic among watched accounts, with the seed list's make-up printed. Not called "trending on Instagram".
- FR-TRD-4. A "rising" label stays off until ≥ 25 accounts and ≥ 8 weeks exist **and** a null simulation shows any topic flagged in ≤ 10% of weeks. It then needs 2 of 3 weeks, ≥ 5 posts and ≥ 3 accounts.
  The v1 rule had roughly a 10.5% false-rise chance per topic-week before its account filter **[calc: one reviewer, reproduced by another; assumes 80 independent posts a week and a 4% topic share]**.
- FR-TRD-5. Third-party distress posts are excluded and only counted. No list is kept.
- FR-TRD-6. Event days: the owner enters about 12 dated events (central banks, jobs reports). Event-related posts are not suggested from 2 h before to 2 h after. Unconfirmed rows do nothing.

### 6.4 Comment suggestions (FR-COM)

- FR-COM-1. **Eligible:** vetted; gates passed this run; post **≤ 24 h old at send**; EN; `substance = point | question | visual-only`; not bait, giveaway, market call,
  distress, sponsored, or a competitor's post; not suggested before. Radar can't see replies to our comments
  on other people's posts (4.3): the owner sees and logs them in the app, and answering there is exempt from the age and weekly limits and never generated.
- FR-COM-2. **Sort, no weights:** caption carries the point → owner-logged earlier reply from this creator → ≤ 6 h old → asks a genuine question → fewer than 100 comments → newest. Velocity is not used.
- FR-COM-3. **Limits:** show ≤ 2 a day, plan 5 a week, cap 10 a week; 1 per creator per 7 days; no minimum. After 3 unanswered comments, rest that creator 30 days.
- FR-COM-4. `substance` is `point`, `question`, `thin` or `visual-only`, judged on whether the caption alone carries the claim. The model **cannot see slides
  or video**. `thin` is dropped. Reels and `visual-only` get an open-the-post card with no content claim, at most 1 a day.
- FR-COM-5. `bait` = comment-keyword funnels ("comment GUIDE"), tag-a-friend, giveaways, in EN/FR/ES. Excluded, and left out of comment medians (shown as a share).
- FR-COM-6. **T1:** the card has the post excerpt (≤ 240 characters), why it's here and **one angle** (the point we could add, or the question we could ask). The owner writes the comment.
- FR-COM-7. **T2:** plus **one** draft, 6–35 words, brand voice ("we" or no pronoun; never the founder's "I"), no link, hashtag, @mention or Zenlot name, ≤ 1 emoji.
  Voice examples are 15 comments the **owner wrote** in the pilot; drafts never train on drafts. Add one repair attempt, then angle only.
- FR-COM-8. Personal to the post, not the person: its claim, example or question. Never age, place, money, mood or other attributes.
- FR-COM-9. Verify (T2): `lintCopy`; a grounding span that exists in the caption; ≤ 5 consecutive words reused; trigram ≤ 0.5 against the last 60; generic-praise,
  advice and prediction lists; arithmetic through the maths checker; no invented experience, results or statistics.
- FR-COM-10. The owner must tick **"I opened the post"** before logging it as posted. Just before sending, re-fetch; drop it if gone. ("Comments turned off" can't be detected: the field is refused.)
- FR-COM-11. Never suggest replying to a Story: it lands in DMs. Radar has no way to post.
- FR-COM-12. If the owner names Zenlot in a comment, disclosure is required (`lintReply`).

### 6.5 Actions and outcomes (FR-OUT)

- FR-OUT-1. Log an `action` for every comment, invite or pitch, **including ones Radar didn't suggest**: actor (`brand`/`founder`), post age, find/read/write minutes, text use.
- FR-OUT-2. One `outcome` check at 48–72 h, one correction at 7 days: visible, creator replied, creator liked, others replied, each yes/no/unknown. No names, no others' text, no record of who followed.
- FR-OUT-3. Ranking stays fixed until 100 outcomes. The only adaptive rules are the visible ones in FR-COM-2 and FR-COM-3.
- FR-OUT-4. Own comment text is kept until the owner deletes it (voice corpus). It must contain no third-party text.
- FR-OUT-5. Report find + write minutes and cash per creator reply. Reading is the job, so it isn't counted as cost.

### 6.6 Collaboration opportunities (FR-COL)

- FR-COL-1. Types: co-authored carousel, guest "how I review my week", creator Q&A, honest app review, journaling challenge, podcast or newsletter swap. FR/ES adaptation waits for FR-LNG.
- FR-COL-2. Stages: `identified → warming → ready → contacted → talking → agreed → live → done`, or `declined` / `parked`.
  **`ready`** needs all of: ≥ 14 days since our first logged comment on that creator's posts; **≥ 1 creator reply** (a like or follow-back isn't enough) or they approached us; gates re-run today; a named offer.
  Waived for people the founder already knows and for outlets with a published pitch route. A Collab *post* also needs ≥ 9 posts and 3 pins on our profile **[judgement]**.
- FR-COL-3. **Offer something other than audience**: at 4 followers, shared reach is worth nothing. Worked maths, a carousel made for them, a template, design help.
- FR-COL-4. Outreach goes from the founder's email or a published business contact, never brand DMs. At most 2 first pitches a month, 1 follow-up after 7 days, then parked 90 days;
  `no_contact` is permanent. 8 pitches with 0 replies: change the offer before sending more.
- FR-COL-5. Outreach copy: ≤ 120 words; names the specific post that prompted it; what they get first; one ask; founder disclosure; easy no. The address is never stored.
- FR-COL-6. The creator must disclose any benefit clearly and before the "more" cut, and we must tell them how and check **[docs: FTC]**. UK enforcement against unlawful FX promotion is active **[press]**. No leveraged-product or signals promoters, no results claims, no scripted testimonials.
- FR-COL-7. Exit clause: we may untag, archive or correct if a partner later promotes signals. A gate hit on a live partner alerts within one run.
- FR-COL-8. **Automation (T3)** only after 3 creators have replied: lists accounts meeting `ready`, with evidence. Ideas stay human-chosen from the types above.
- FR-COL-9. Our own Collab posts carry `collab: true` and are left out of the planner's performance comparison, whose reach would otherwise mislead it.
- FR-COL-10. Reject a collaboration whose owner-entered audience market can't install the app.

### 6.7 Competitor tracking (FR-CMP)

- FR-CMP-1. Monthly, Instagram only, 6–8 accounts: posts, format mix, caption openings, calls to action, topics, follower change, median comments, Reel views, top 3, outliers.
- FR-CMP-2. Own history first; same format, same age (≥ 7 days old). An outlier is ≥ 2× the account's median with ≥ 8 comparable posts, bait excluded.
  **Where > 20% of likes are hidden, compare comments and Reel views only** and say so. Never average a hidden like as 0.
- FR-CMP-3. Reach, saves, shares and follows don't exist for other accounts. Flag possible paid, Collab or cross-posted distortion; don't claim it. Deduplicate by shortcode. Compare posts ≥ 7 days old and print each metric's age. Mark *late-appearing* only if an earlier successful fetch after publication lacked the post; backfill is exempt.
- FR-CMP-4. **Gap** = a topic ≥ 3 tracked accounts posted on in 28 days that has no post of ours in 4 calendars by `topicId`. "Nobody engages with ours" is not a gap at this size.
- FR-CMP-5. Tables and three fixed template lines. No LLM prose. Every number must exist in the table.
- FR-CMP-6. Never print "share of voice", "market share", "leading" or "trending on Instagram". A lint enforces it.
- FR-CMP-7. Store facts (price, rating count, languages, last release) for about 6 nearby apps: a hand-filled quarterly sheet with source and date. No collector or review mining until D11.
- FR-CMP-8. `gone` posts drop out of comparisons without comment. Only formats this account can make are marked `actionable_now` (the planner can't make Reels).

### 6.8 Planner feed (FR-PLN)

- FR-PLN-1. **By hand first (T0):** at most one brief a week, pasted into the existing `notes` input before 16:00 Sunday: reader question, our angle, slot. Own words, no handles:
  notes can appear in public logs. Because an existing week is skipped, the notes run must come first or use `force`.
- FR-PLN-2. Calendar posts gain optional `topicId` and `briefId` (opaque). Optional means old weeks stay valid.
- FR-PLN-3. **Machine-fed (T3):** only if ≥ 4 of 6 hand briefs were judged useful. ≤ 1 brief a week, leading at most 1 of 5 posts, tagged `evidence_kind: question | count`. Missing or > 8 days old: planning proceeds as today.
- FR-PLN-4. `topic`, `theme`, `rationale` and notes are linted for competitor names, quotes and the FR-CMP-6 phrases. The check must not print or commit the list of names.
- FR-PLN-5. Brief results go beside the post's own 48 h snapshot. No conclusion below the planner's existing 10-post minimum.

### 6.9 Listening (FR-LIS): before outbound

- FR-LIS-1. Add our `/tags` to the comment digest. `not ready: permission` must never read as "no tags".
- FR-LIS-2. Read comments on all posts under 90 days once a day (skipping those whose `comments_count` is unchanged, re-reading weekly in case of replacement); the latest 10 at other polls.
  The client follows `paging` for media, comments and replies (today it reads one page of 50) and adds `comments_count` to media fields; a hit cap shows `incomplete` at the top of the digest.
- FR-LIS-3. A 5-minute Sunday hand sweep: `zenlot`, `zenlot support`, `zenlot signals` and impostor accounts. Nothing collected.
- FR-LIS-4. Store reviews: use store notifications while there are 0 ratings. @mentions and Story mentions stay in-app.
- FR-LIS-5. Order in every email: urgent → unreviewed → people who commented on or tagged us → suggestions.

### 6.10 Safety and continuity (FR-SAF)

- FR-SAF-1. Over-inclusive EN/FR/ES distress, scam and impersonation patterns in `redFlags`. FR/ES *safety* ships now; FR/ES *drafting* doesn't.
- FR-SAF-2. If triage fails, deterministic hits stay urgent and every other new comment is `unreviewed`, directly after them, never `other`.
- FR-SAF-3. Targets from detection: distress 4 waking hours, impersonation or scam 8 h, creator reply or product question 24 h, other 48 h. `docs/COMMUNITY.md` states that polling, so detection, can lag.
- FR-SAF-4. `OWNER_AWAY=true`, set by the owner, stops suggestions and pauses publishing. Unread email can't be observed, so nothing pauses on a guess. Safety digests continue, also to `SAFETY_BACKUP_EMAIL`; without it they go to the owner with a warning. Posts missed while away become `skipped`, so nothing bursts out on return.
- FR-SAF-5. `docs/INCIDENTS.md`, one page: severities, pause switches, correction template, evidence first, who speaks, hacked account, partner turns bad, local emergency resources.
- FR-SAF-6. Action block: pause 72 h, resume at 1 a day for 7 days; a second in 30 days stops comments. Meta warning: stop and check Account Status. An invisible comment is an owner check, not an automatic pause.
- FR-SAF-7. Owner checklist: second admin, 2FA, recovery contact, token type and permissions recorded, secret expiry dates.

### 6.11 Languages and markets (FR-LNG)

- FR-LNG-1. Discovery, angles, drafts and outreach are English only in v1.
- FR-LNG-2. A language opens when a fluent person can hold the thread, the listing is live and localised in the target market, 5 creators are vetted and its gate list is tested.
- FR-LNG-3. A private monthly hand check of store availability by market. Until R18 is settled, don't add new claims about French or Spanish support on iPhone.
- FR-LNG-4. Market is entered by the owner, never inferred from a person.

### 6.12 Review workflow (FR-REV)

- FR-REV-1. Weekday email only when something qualifies. Friday always sends the week's actions, replies with denominators, minutes, cost and health. First weekday
  run of a month adds the competitor table (T2). The existing Sunday planner email carries own-account metrics only.
- FR-REV-2. Decisions by CLI: `used`, `edited`, `dismissed` + reason (`irrelevant`, `unsafe`, `stale`, `wrong-tone`, `generic`, `other`), `vetted`, `rejected`, stage changes, outcomes.
- FR-REV-3. An inbox is **deferred** until > 30 decisions a week or > 25% of items are undecided after 72 h. If built: Cloudflare Access, GET only shows, POST + CSRF to change, strict CSP, escaped text.

## 7. Data

### 7.1 Schema (abridged)

```sql
account(id TEXT PK, platform, handle, platform_id, roles JSON, tier, status, reason_code, lang, market,  -- market owner-entered
        first_seen_at, last_fetched_at, vetted_at, vetted_by, discovered_via, UNIQUE(platform, platform_id))
account_snapshot(account_id, day, followers, posts, PRIMARY KEY(account_id, day))
post(id TEXT PK, account_id, platform_post_id, shortcode, url, published_at, first_seen_at, format, text, text_hash,
     topics JSON, substance, bait, caption_opening, cta_type, slide_count NULL, lang, safety JSON, classify_version, state, UNIQUE(account_id, platform_post_id))
post_metric(post_id, captured_at, likes, comments, views, reposts, PRIMARY KEY(post_id, captured_at))  -- NULL = not available
suggestion(id, kind, subject_id, day, angle, draft, evidence JSON, prompt_version, model, state, shown_at,
           UNIQUE(kind, subject_id))
decision(id, suggestion_id, decision, reason, decided_at)
action(id, suggestion_id NULL, account_id NULL, kind CHECK(kind IN('comment','invite','pitch','other')), channel,
       actor CHECK(actor IN('brand','founder')), done_at, post_age_h, opened INT, find_min, read_min, write_min,
       text_use CHECK(text_use IN('own','angle','draft_edited','draft_as_is')), own_text NULL)
outcome(action_id PK, checked_at, visible, creator_replied, creator_liked, others_replied, blocked)  -- yes|no|unknown
follow_source_week(week PK, known_invite, app_user, thread_seen, creator, collab, unknown)           -- counts; ends at 100
account_metric_week(week PK, profile_views, website_clicks, reach, followers)                         -- own account
question(id, paraphrase, topic_id, source_type, seen_on, count)              -- no handles, no quotes
collab(id, account_id, type, stage, offer, next_step, first_pitch_at, last_touch_at, due_at)  collab_event(...)
run(id, slot UNIQUE, started_at, finished_at, status, stage_status JSON, counts JSON, cost JSON)
suppression(platform, handle_hash, reason_code, created_at)
```

Handles are public, the table is private. Email addresses, phone numbers, ages, locations and third parties' names beyond the display handle are never stored.
D1 takes 100 bound parameters per query **[docs]**, so upserts are chunked. `account_metric_week` is our own data and may live in git beside `account-history.json`.

### 7.2 Retention

| Data | Kept | Then |
|---|---|---|
| Caption text, biography (bio is used, not stored) | 30 days | `text` set to NULL; hash and topics stay |
| Post metrics, account snapshots | 180 days | Deleted |
| Unvetted candidates | 30 days | Deleted, hash kept in `suppression` only if rejected |
| Suggestions and drafts | 90 days | Payload deleted; decision and codes kept |
| Actions, outcomes | 180 days | Reduced to weekly counts; account link cleared on `forget` |
| Owner's own comment text, question paraphrases | Until the owner deletes them | Contain no third-party text |
| Run records | 180 days | Deleted |

- Purge is its own step. It runs on every scheduled dispatch, even when a run fails, `RADAR_ENABLED` is unset or `OWNER_AWAY` is true. Before removing the schedule or D1 token, run `radar purge --all`.
  On Friday it also clears what would expire over the weekend.
- D1 Time Travel holds 7 days on the free plan **[docs]**, so a deleted row can exist in recovery history that long.
- `radar forget <platform> <handle>` removes an account and everything linked, and adds a suppression hash.
- Emails already sent are outside this retention, so they quote ≤ 240 characters.

### 7.3 Privacy and security

- NFR-S1. Actions logs are public: log counts, IDs of our own rows and error codes only. A `safeLog` wrapper is the only logger
  in `src/radar`, and CI rejects `console.*` there. Never upload artifacts from Radar.
- NFR-S2. Radar refuses to run on GitHub with the SQLite store, or if `RADAR_STORE` isn't `d1`.
- NFR-S3. The D1 token is scoped to one database; Instagram errors are stripped of URLs (the token is in the query string).
  A hash key (`RADAR_HASH_KEY`) is a secret.
- NFR-S4. Third-party text is untrusted: delimited as data, length-capped, control and bidi characters removed, never placed in a system
  prompt; model output is schema-validated and can only choose from provided IDs. There are no tools to call.
- NFR-S5. Keep the shared Instagram token's publishing safe: Radar uses GET only, and stops at 40% of app usage. A separate token is better if Meta allows it: check in T0.
- NFR-S6. Secrets only in steps that need them; `permissions: contents: read`; third-party actions pinned by commit SHA.

## 8. Selection rules

v1's 0–100 creator and collaboration scores, velocity, topic lift and feedback multipliers are removed: with 25 accounts the percentiles, buckets and
weights were guesses, and two owner clicks could swing a rank. What remains is pure, tested code:

| Where | Rule |
|---|---|
| Creator candidates | Gates → topic share → activity; raw values shown (FR-CRE-3) |
| Comments | Eligibility → five-step sort (FR-COM-1, FR-COM-2) |
| Collaboration | `ready` checklist (FR-COL-2) |
| Competitor outlier | ≥ 2× own median, same format, ≥ 8 comparable posts (FR-CMP-2) |
| Rising topic | Off until FR-TRD-4 passes |

Bring back a score only when ≥ 100 outcomes exist and it beats this sort on held-out weeks.

## 9. LLM use

| Step | Input | Output (schema) | Volume | Default |
|---|---|---|---|---|
| Classify | ≤ 20 captions a call | topic, substance, bait, caption opening, call to action, language, flags per ID | ≤ 10 creator posts/day; competitors monthly in a batch | `claude-opus-5-5`, effort `low` |
| Angle (T1) | 1 caption + rules | one angle + grounding span, or `skip` | ≤ 4/day | `claude-opus-5-5`, effort `medium` |
| Draft (T2) | same + owner's examples | one draft, or `skip` | ≤ 4/day | `claude-opus-5-5`, effort `medium` |

- `runStructured(op, prompt, schema, opts)` is extracted from `strategist.ts`: Claude with schema output and `fallbacks: 'default'`, then
  OpenAI and Grok validated against the same schema. Lists are wrapped in an object (R9).
- Handle `refusal`, `max_tokens` and invalid output by name. Unclassified posts are retried next run and never suggested meanwhile.
- Cache by `text_hash + prompt_version`.
- **Evals** use synthetic or owner-written text: **0 hard-gate misses on 60 unsafe fixtures (EN/FR/ES)**; 0 of 20 injection cases followed; 40 captions for substance and bait
  (report accuracy with its interval, no false precision); pilot's 20 real cases scored on a binary rubric (specific, adds something, in voice, safe, would post).
  Drafting also needs a five-day shadow run. A pass on 21 of 30 is compatible with 52–83%, so it can't be the only gate **[calc, review]**. Re-run on any prompt or model change.

## 10. Cost and capacity

| Item | Assumption | Monthly |
|---|---|---|
| Classification | ~15k input + ~7k output tokens a weekday, Opus 5.5 at $4/$20, 22 days | ~$4 |
| Angles, then drafts | ~18k in + ~9k out a weekday | ~$6 |
| Competitor batch (T2) | ~40k in + ~15k out | ~$0.50 |
| D1, Workers, Actions | within free limits | $0 |
| **Total** | | **~$11** |

All **[estimate]**. `Budget` caps each run at 40 calls and $1, and each month at $25; the run ends cleanly at a cap. Capacity: 25 accounts = 25 calls plus re-checks; cap 40.
The owner's time is the real cost: at 15 minutes a day, 22 build days equal about 700 daily sessions **[calc]**. This is why spending is staged.

## 11. Non-functional requirements

- NFR-1. A run finishes in < 10 minutes at 40 accounts; hard timeout 20.
- NFR-2. Idempotent: `run.slot` (`2026-11-24-weekday`) is unique and rows are upserted, so a duplicate dispatch exits
  early. A crashed run resumes at its first unfinished stage; `--force` overrides. The email stage records *sent* only after SMTP accepts, so it can in rare
  cases send twice, never silently skip.
- NFR-3. One failing account or source never stops the rest. A source is `degraded` if > 20% of its calls fail; two in a row emails a warning.
- NFR-4. `DRY_RUN=true`: local SQLite, fixtures by default (`--live-read` to call real APIs, which can cost money), email to `out/radar/`. No decisions written.
- NFR-5. Retries: 2 with jitter on network errors and 5xx; honour `Retry-After`; no retry on 4xx other than 429. Every fetch has a 15 s timeout (the current Instagram client has none).
- NFR-6. Every metric shows its capture time; missing values are NULL, never guessed.
- NFR-7. All times UTC; weeks ISO, using `isoWeekId`.

### 11.1 Failure handling

| Failure | Behaviour |
|---|---|
| Unknown handle (error 110 / 2207013 **[tested]**) | `unavailable` after 3 runs; no alert |
| Token invalid (190) | Stop Instagram; urgent email, since publishing is affected too |
| Rate limited, or usage ≥ 40% | Stop fetching; oldest-fetched accounts go first next run |
| API field removed | Schema parse fails → source degraded, raw body never logged |
| All LLM providers down | Collect only; email says suggestions are unavailable. Own comments become `unreviewed` (FR-SAF-2) |
| Action block or Meta warning | FR-SAF-6 |
| Owner away | FR-SAF-4 |
| D1 down | Fail the run; nothing sent; next slot recovers (missed snapshot stays missing) |
| Email fails | Run fails at that stage and resumes there |
| Budget reached | Finish with what exists; say so in the email |

## 12. Configuration

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `RADAR_ENABLED` | variable | `false` | Master switch for scheduled runs |
| `RADAR_COMMENTS` | variable | `off` | `off`, `angle` or `draft`; needs expected supply ≥ 5 a week |
| `RADAR_PLANNER` | variable | `false` | Machine-fed brief (T3) |
| `RADAR_WINDOW_UTC` | variable | `15:00` | When the owner engages; the run is 30 min earlier |
| `OWNER_AWAY` | variable | `false` | FR-SAF-4 |
| `SAFETY_BACKUP_EMAIL` | secret | — | Never logged or committed. `golive-check` fails `OWNER_AWAY=true` without it |
| `RADAR_STORE` | variable | `sqlite` | `d1` required on GitHub |
| `CF_ACCOUNT_ID`, `RADAR_D1_ID` | variable | — | Database |
| `RADAR_D1_TOKEN`, `RADAR_HASH_KEY` | secret | — | |

`env.ts` requires `ANTHROPIC_API_KEY` at import, which has already broken one job (fixed in PR 15). Radar's stage-specific
config is validated per command, so `radar purge` or `decide` needs no LLM key. Switching off = unset `RADAR_ENABLED`.

CLI: `npm run radar -- <run|add|vet|reject|pause|decide|log|outcome|ask|forget|status|report|purge> [--dry-run] [--now ISO] [--stage name]`.

## 13. Tests and acceptance

`node:test` through ts-node, no new dependency. CI on every pull request: typecheck + tests.

| Layer | Covers |
|---|---|
| Unit | Gates (EN/FR/ES), eligibility, sort, supply, `ready`, retention, rates with unknowns |
| Contract | Synthetic `business_discovery` shapes: full, hidden likes, no views, not found, 429, 190, malformed, refused field |
| Store | Same suite on SQLite and (optional) a test D1 database |
| Pipeline | Two simulated weeks with `--now`: duplicates, crash at each stage, purge |
| LLM | Schema failures, refusal, provider hop, evals, injection |
| Security | No write imports, no `console` in radar, log scan for fixture text |

- AC-1. Nothing reachable from `src/workflows/radar.ts` can post; the HTTP layer rejects non-GET to social hosts.
- AC-2. 20 real accounts yield rows and a digest; re-running the slot changes nothing.
- AC-3. An unvetted, expired, gated or paused account never appears (1,000 random states), including a gate hit **between suggestion and email**.
- AC-4. Every angle and draft is grounded in the caption and every draft passes verify; open-the-post cards are exempt from grounding and contain no content claim.
- AC-5. Each report number matches a computed cell; banned phrases fail the build.
- AC-6. Hidden likes show *not available*, and an account with 52% hidden likes is compared on comments and views only.
- AC-7. After `forget`, no table has the account; expired text is gone after a run. With `RADAR_ENABLED` unset, a dispatch still purges and makes no Instagram or LLM call.
- AC-8. The Actions log of a full run contains no handle, caption, angle or draft.
- AC-9. With Radar off or broken, planner, publisher and comment digest behave as before.
- AC-10. Budget reached mid-run: partial digest, recorded, exit 0.
- AC-11. A 30 h-old viral post loses to a 3 h-old quiet one; nothing over 24 h at send is shown.
- AC-12. With all models failing, EN, FR and ES distress, scam and impersonation fixtures are urgent and every other new comment is `unreviewed`.
- AC-13. `OWNER_AWAY=true` stops suggestions and publishing; the safety digest also goes to the backup, or to the owner with a warning if none is set.
- AC-14. `unknown` is in neither numerator nor denominator; over 25% unknown prints no rate; pitches never enter it.
- AC-15. Unanswered comments never make a creator `ready`; a creator reply does once 14 days have passed since our first logged comment, gates pass today and an offer is named (FR-COL-2 waivers apart). A third first pitch in a month is refused.
- AC-16. A tagged fixture appears once, above suggestions; missing permission shows *not ready*.
- AC-17. No saved calendar field contains a competitor name or quote from a brief.
- AC-18. The Sunday email's "link-in-bio taps" equals `website_clicks`, and one failing metric doesn't blank the others.

## 14. Implementation plan

Focused working days **[estimate]**, tests included. One pull request per task unless noted.

### 14.1 Pilot: 24 November to 20 December at the latest (no code)

Extends the routine already in `FIRST-FOLLOWERS.md`; ends early once 20 results are known. The owner first finishes the **step-1 invites** (the repo's own
advice: under 50 followers nothing matters as much) and the store check.

- Vet ≥ 16 creators by hand. Post up to 2 comments a day on posts ≤ 24 h old, 1 per creator per 7 days, on ≥ 8 days. At 50% weekly eligibility, 16 creators give
  about 8 a week, so about 20 in two and a half weeks plus the 48–72 h check **[calc]**. Fewer creators take longer.
- In a private sheet with FR-OUT's columns: find, read and write minutes, post age, comments already there, outcome.
- Start the question log.

**Gate A, replies** (creator replies only):

| At 20 known results | Decision |
|---|---|
| 0 | Stop comment work |
| 1–2 | Extend to 40; pass at ≥ 4 in total |
| ≥ 3 | Pass |

| True reply rate | 5% | 10% | 15% | 20% |
|---|---|---|---|---|
| Chance this gate passes **[calc]** | 15% | 58% | 87% | 97% |

Reviewers proposed pass rules from lenient (≥ 3 in 40) to strict (≥ 5 in 40, or 3 in 20 only). This one is chosen because a false stop ends the channel, while a false
pass meets the next check at 40 Radar comments. Fewer than 20 known results by 24 December: capacity has failed; stop. If extended
to 40, post 4–24 January and decide by 31 January; under 40 known by then: pass only with ≥ 4 replies. Comments from 21 December to 3 January don't count. Never call the result significant.

**Gate B, bottleneck** (shares of find + **read** + write minutes): finding ≥ 40% → fund T1. Otherwise writing ≥ 40% → build nothing yet, unless the owner
chooses D12 drafts, which funds T1 and T2.1 together (9.5 days). Neither → build nothing for comments.
Running out of posts means **too few vetted creators**, so vet more; it doesn't justify a finder.

**Gate C, supply and safety:** expected supply ≥ 5 a week, no unsafe comment, block or warning.

### 14.2 T0: worth doing whatever the pilot says (4 days)

**Built 24 November 2026.** T0.1–T0.5 are done and tested. T0.6 is partly open: it needs the owner's own handles, and whether Meta allows a separate read token is unanswered.
The X link page (`/x`) and the fixed campaign names (R17) are built in the website repository on `feat/x-link-page`, not deployed yet.

| ID | Task | Days | Done when |
|---|---|---|---|
| T0.1 | `ci.yml`, `npm test`; fix R1 and R9 | 1 | Lists of 0, 1 and 2 objects parse; CI green |
| T0.2 | Safety: EN/FR/ES distress and scam patterns, `unreviewed`, `OWNER_AWAY` and backup in `instagram.yml`, `INCIDENTS.md`, SLA text | 1 | AC-12, AC-13 |
| T0.3 | Listening: tags and 90-day comments, one shared paging helper | 0.5 | AC-16; a fixture with 65 posts and 120 comments on one loses none |
| T0.4 | Measurement: relabel and store `website_clicks`, isolate metrics, stable campaign names, separate X link (docs; the page is in another repo) | 0.5 | AC-18 |
| T0.5 | `topicId`/`briefId` on posts, 8 topics, hand-brief instructions, banned-phrase lint | 0.75 | Old calendars still load; AC-5 lint |
| T0.6 | Spike: 20 owner handles. Hidden-like rate, usage headers, separate token, `biography`/`website`, Collab duplicates, trial Reels, `collaborative_media` | 0.25 | Results recorded in 4.3 |

### 14.3 T1: shared base and comment angles (7.5 days) [pilot gates, or D9; D1, D2, D6]

| ID | Task | Days |
|---|---|---|
| T1.1 | Types, config, D1 + SQLite stores, `safeLog`, HTTP guard, purge, `forget`, run records | 2.5 |
| T1.2 | Instagram source, budget, contract fixtures | 1 |
| T1.3 | `runStructured` + strategist moved to it; classify + evals | 1 |
| T1.4 | Registry, gates, re-gating, vetting cards, CLI | 0.5 |
| T1.5 | Eligibility, sort, supply, angle, email, `action`/`outcome`, weekday schedule, dead-man | 2.5 |

T1.1–T1.4 (5 days) are the **base**: a competitor table can be funded on these alone, run monthly by hand with `radar report` (the schedule is in T1.5). T1.5 needs Gates A–C. Worker deployment is an owner step.

### 14.4 T2: after the 40-comment check, or separately chosen (4.5 days)

| ID | Task | Days | Gate |
|---|---|---|---|
| T2.1 | One draft: voice pack, verify, rubric, shadow week | 2 | 40-comment check passes and writing is the bottleneck, or D12 chosen. Always with the shadow week |
| T2.2 | Monthly competitor table + topic counts (14 topics) | 2.5 | Base built; a named decision it will inform |

### 14.5 T3: earned later (2 days)

| ID | Task | Days | Gate |
|---|---|---|---|
| T3.1 | Collaboration shortlist and stages | 1 | 3 creators have replied |
| T3.2 | Machine-fed brief + leak lint | 1 | 4 of 6 hand briefs useful |

### 14.6 Budget

| Path | Days |
|---|---|
| Committed now (T0) | **4** |
| Comments stop at the pilot | 4 |
| Comments angle only | 11.5 |
| Competitor table without comments | 4 + 5 + 2.5 = 11.5 |
| Everything | **18, about 22 with 20% contingency** |

The final system is not much smaller than v1's 22 days. The gain is that 4 days, not 22, are spent before evidence. Adopting every reviewer addition as written would have added roughly 24 more days **[estimate, review]**.

### 14.7 Timeline and rollout

```
24 Nov – 20 Dec   Pilot by hand + T0 (ends early at 20 known results)
24 Dec            Gate decision at the latest; 31 Jan if extended to 40
January           T1 if gates pass
+ about 8 weeks   40-comment check at 5 a week (4 at the cap of 10) → T2, hold or stop
```

Rollout: fixtures → `--live-read` on 5 accounts → D1 with email to owner only → five-day shadow → `angle` → `draft`. Rollback: unset the variable; schema changes are additive.
Each switch is added to `golive-check.ts` and `docs/RADAR.md`.

**Parked, each needs its own go-ahead:** X, YouTube, hashtag App Review, web discovery, inbox, rising topics, FR/ES drafting, store collector. Reddit code removal is D5.

## 15. Decisions for the owner

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Where third-party data lives, given the public repo | Private D1, scheduled. Alternative: local SQLite, run by hand, saves roughly 1.5 days **[estimate]** but isn't unattended | T1 |
| D2 | First read source | Instagram only | T1 |
| D3 | Pay for X? | No; parked | — |
| D4 | Cheaper classification model? | Test Haiku 5.5 on the eval; about $4 a month is at stake, so low priority | — |
| D5 | Retire the Reddit agents | Yes, after confirming Reddit's dates. Unregistered apps start losing access on 12 January 2027 **[press]** | — |
| D6 | Accept the Meta Platform Terms reading in 4.2? | Yes within the limits stated; have someone qualified check. Not legal advice | T1 live |
| D7 | Who vets, decides and covers when away? | One named person plus a backup for safety | Pilot |
| D8 | Personal email in `go-live.json` (R4) | Replace with a role name | — |
| D9 | Pilot first, or build straight away? | Pilot. The base + competitor table may go ahead without it if you want that output | T1 |
| D10 | Listing languages and 0 ratings (R18); EU availability is confirmed | Add French and Spanish in App Store Connect if the app has them, or correct the copy | FR-LNG |
| D11 | Competitor store data | Hand sheet only, until Apple's terms for this use are confirmed | FR-CMP-7 |
| D12 | Angle first, or AI drafts from day one? | Angle first; you asked for suggested comments, so drafts follow at T2 or sooner if you prefer (+2 days) | T1.5 |

## 16. Risks

| Risk | Likelihood / impact | Response |
|---|---|---|
| Comments from a tiny account earn nothing | High / medium | Pilot; gates; 4 days at risk |
| Reply rate doesn't predict follows or installs | Medium / high | Funnel reported; no reviewer had evidence for this link |
| Meta objects, affecting the **publishing** token | Low / very high | 40 calls, GET only, separate token if possible, D6 |
| Action block or filtered comments | Medium / high | ≤ 2 a day, FR-SAF-6 |
| `business_discovery` changes, or hidden likes spread | Medium / high | Contract tests, comments/views fallback |
| Too few clean creators | High / medium | Supply formula blocks the switch; vetting is the remedy |
| Drafts read as AI, or misread visuals | Medium / high | Angle first, owner voice, substance gate, "opened" tick |
| Vetted creator turns to signals | Medium / high | FR-REG-7, exit clause |
| Distressed person missed | Low / very high | FR-SAF-1 to 3, backup |
| Selection bias: our list decides what looks common | High / medium | Seed make-up printed; banned phrases; questions first |
| Owner doesn't log outcomes | High / high | One check, unknown allowed; idle rule pauses |
| Promotion where iOS can't be installed | Low / medium | D10, FR-LNG |
| Third-party data leaks through public CI or calendar | Medium / high | D1, `safeLog`, AC-8, AC-17 |
| Prompt injection | Medium / low | No tools, schema output, human review |

## 17. Traceability

| Request | Requirements | Delivered | Acceptance |
|---|---|---|---|
| Identify relevant creators | FR-REG, FR-CRE, FR-LIS | T1 (assisted, not autonomous) | AC-2, AC-3, AC-16 |
| Discover trending discussions | FR-TRD, FR-PLN | T0 questions, T2 counts | AC-5 |
| Suggest personalized comments | FR-COM, FR-OUT | T1 angle, T2 draft | AC-1, 3, 4, 11, 14 |
| Identify collaboration opportunities | FR-COL | Manual now, T3 | AC-15 |
| Track competitor content performance | FR-CMP | T2 | AC-5, AC-6 |

## 18. Sources

Checked 24 November 2026.

- Meta: [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery),
  [Hashtag Search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search.md),
  [rate limits](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/),
  [Platform Terms](https://developers.facebook.com/terms/)
- X: [pricing](https://docs.x.com/x-api/getting-started/pricing), [developer guidelines](https://docs.x.com/developer-guidelines),
  [policy](https://docs.x.com/developer-terms/policy), [agreement](https://docs.x.com/developer-terms/agreement),
  [search operators](https://docs.x.com/x-api/posts/search/integrate/operators), [search](https://docs.x.com/x-api/posts/search/introduction)
- YouTube: [quota](https://developers.google.com/youtube/v3/determine_quota_cost),
  [developer policies](https://developers.google.com/youtube/terms/developer-policies)
- Reddit: [TechRepublic on the API and RSS shutdown](https://www.techrepublic.com/article/news-reddit-rss-public-api-shutdown/),
  [Redmantu timeline](https://redmantu.com/blog/reddit-api-rss-json-shutdown/),
  [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) (search summary only; the page refused automated reading)
- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- Tavily: [credits](https://docs.tavily.com/documentation/api-credits)
- Store availability: Apple's public lookup API, 24 Nov 2026: 12 storefronts, then all 27 EU storefronts again at 05:40 UTC
- LinkedIn, Telegram, Threads, TikTok: official docs, read by the reviewing agent and not re-read since: [LinkedIn restricted uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases), [Telegram bots](https://core.telegram.org/bots/faq), [Threads search](https://developers.facebook.com/docs/threads/keyword-search), [TikTok Research API](https://developers.tiktok.com/products/research-api/)
- Disclosure: [FTC endorsement FAQ](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking),
  [FCA on finfluencers](https://www.fca.org.uk/news/press-releases/fca-spearheads-global-action-stop-illegal-finfluencers) (both read as search summaries)

## 19. Review record

Four agents reviewed v1 alone (48 findings), then each read the other three plus live test results and revised. In a third round all four re-read v2 and returned **accept with fixes**; those fixes are in this text. Claims were checked before adoption.

### What v1 was missing

| Theme | Raised by | Now |
|---|---|---|
| Proof that comments work before 22 days of build; invites come first | Growth, Social | 14.1, D9 |
| Outcomes, not just "used"; stop and scale rules | Instagram, Growth, Content, Social | 2.3, FR-OUT |
| Fresh posts: v1 favoured 12–48 h-old threads | Instagram | 5.1, FR-COM-1/2 |
| The model can't see slides or Reels; comment-bait inflated scores | Content, Instagram | FR-COM-4/5 |
| Reader questions, shared topic IDs, usable briefs | Content | FR-TRD-1, FR-PLN |
| Noise: scores, lift and percentiles at 20 accounts | Content, Instagram, Growth | Section 8 |
| Listening to people who already mention us | Social, Instagram | FR-LIS |
| Distress, incidents, away cover, action blocks | Social, Instagram | FR-SAF |
| EU store absence (since fixed); language and market checks | Social, Content | FR-LNG, D10 |
| Replies, not our own activity, make a relationship `ready`; offer more than audience | Social, Instagram, Content, Growth | FR-COL-2/3 |
| Supply maths: 10 creators can't feed 3 comments a day | Growth, Content | FR-CRE-6 |
| Right competitors; no "share of voice"; hidden likes | Social, Instagram | FR-CMP |
| Wrong metric label, shared X link | Growth, Social | R13, R17 |
| Leaks through `rationale`; owner voice; one draft | Content | FR-PLN-4, FR-COM-7 |
| Vetted creators who turn bad | Social | FR-REG-7 |

### What was changed or rejected after checking

| Proposal | Result |
|---|---|
| "Account metrics are dead" (Growth) | **Wrong.** All returned data. Label and storage points kept |
| `alt_text`, audio type and other fields (Instagram) | Refused by the API; dropped |
| Mentions stripped from captions (Instagram; doubted by Social) | Confirmed, 0 of 250 |
| ABBA on/off weeks (Growth) | Withdrawn: can't detect anything at this volume |
| 2 replies in 10 as the gate (Growth) | Fails a true 20% channel 38% of the time; replaced |
| Pause publishing when email is unread (Social) | Unobservable; owner-set flag |
| "Topic ownership" metric (Social) | Dropped: share of our own hand-picked list |
| ICE and partner-probability formulas (Growth) | Dropped: invented inputs |
| Ranking weights (Instagram) | Replaced by a sort |

### Where reviewers still differ

| Question | Positions | Choice and why |
|---|---|---|
| Where it runs | Content: local, by hand. Others: scheduled | Scheduled: automation was the request. D1 keeps local open |
| Pilot pass mark | ≥ 3 in 40 (Growth; Instagram variant); ≥ 5 in 40 (Content); ≥ 3 in 20, one extra week at 2 (Social) | ≥ 3 in 20, else ≥ 4 in 40 |
| Drafts | None (Content default), one (Instagram, Social), one later (Growth) | Angle, then one draft; D12 lets you choose |
| Kill level | < 5% (Instagram); < 10% (Content); < 10% **and** no thread-attributed follows, on ≥ 20 (Social) | < 10% on 40 |
| Does the pilot gate competitor tracking? | Reviews fold it behind the same gate | No: it doesn't depend on comments working |
| Account cap | 30 to 40 | Start 25, cap 40 |
