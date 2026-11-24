# Growth Radar pilot

By hand, 24 November to 20 December 2026 at the latest. Ends early once 20 comments have a known result.
Why and how it's judged: [TRD-GROWTH-RADAR.md](TRD-GROWTH-RADAR.md) section 14.1.

Before starting: finish step 1 of [FIRST-FOLLOWERS.md](FIRST-FOLLOWERS.md), and check the listing languages
in App Store Connect and Play Console (EU availability was confirmed on 24 November).

## Each day (about 15 minutes)

1. Answer people who commented on or tagged us.
2. At most **2** comments, on posts up to 24 hours old (under 6 is better), one per creator per 7 days.
3. Two or three days later, note what happened to each one. "I don't know" is a fine answer.

Vet at least 16 creators first. All must be true: no signals or paid group, no broker referral links, no profit
screenshots, posts education, real audience, not pretending to be someone. Open every link in their bio.

## Your private sheet

Keep it **outside this repository** (it's public). Start from [pilot-template.csv](pilot-template.csv). One row per
comment, invite or pitch:

| Column | Write |
|---|---|
| `kind`, `actor` | comment / invite / pitch; brand / founder |
| `done_at`, `post_age_h`, `comments_already_there` | when, and how fresh and busy the post was |
| `find_min`, `read_min`, `write_min` | minutes spent on each |
| `own_text` | what you wrote. The best 15 become the voice examples for drafts later |
| `visible`, `creator_replied`, `creator_liked`, `others_replied` | yes / no / unknown, checked once at 48–72 hours |
| `blocked` | yes if Instagram limited the account |

## Question log

In the same private sheet, a second tab: `id` (q01, q02…), the question **in your own words** (no names, no quotes),
topic, where it came from (comment / invite / answer to us), date, how many people asked.

Topics: `position-sizing`, `drawdown`, `risk-reward`, `trade-planning`, `discipline`, `journaling`, `market-basics`,
`zenlot` (defined in `src/instagram/taxonomy.ts`).

## Turning a question into a post

At most one a week. **Before 16:00 UTC on Sunday**, run the Zenlot Instagram workflow by hand with job `plan` and notes:

```
[brief:q07 slot:mon] Readers ask why risking 2% feels small but hurts after a losing run. Angle: show five losses in a row.
```

`slot` is `mon`, `tue`, `wed`, `thu` or `sat`. The post carries `briefId: q07`, so its results can be found later. The 16:00 run then finds the
week planned and stops. If it's already planned, tick **force**.

Notes are public (they show in Action logs). The run refuses notes that name another account or a competitor, quote
someone at length, or use phrases like "share of voice". To have competitor names caught, put them in the `RADAR_COMPETITOR_NAMES` secret.
