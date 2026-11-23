# zenlot-cron-trigger

A Cloudflare Worker that starts the Instagram workflow on schedule, because GitHub stopped firing this
repo's `schedule:` triggers (no scheduled run since 8 Aug 2026, even after re-enabling the workflows).

At the same UTC times as `.github/workflows/instagram.yml` it calls GitHub's `workflow_dispatch` API:

| Cron (UTC) | Job |
|---|---|
| `7 13,14,18 * * *` | `publish` |
| `37 13-16,19,22 * * *` | `comments` |
| `0 16 * * SUN` | `plan` |

If GitHub's own schedule starts working again, the extra runs are harmless: runs share a concurrency group,
the publisher only posts what's due and never twice, and the planner skips a week that already has a calendar.
The only visible duplicate would be a second comment-digest email.

It has no public URL (`workers_dev = false`), so nothing can trigger it over HTTP.

## Secret

`GITHUB_TOKEN`: a fine-grained GitHub token for **this repository only** with **Actions: Read and write**
(nothing else). Set it in the Cloudflare dashboard (Workers → zenlot-cron-trigger → Settings → Variables and
Secrets → Add → Secret), or with `npx wrangler secret put GITHUB_TOKEN` from this folder. Tokens expire: set a
calendar reminder to renew it before its expiry date.

## Changing times

Edit the cron in three places together: `wrangler.toml` `[triggers]`, `CRONS` in `src/index.ts`, and the
workflow's `schedule:`. Then `npx wrangler deploy` from this folder.

## Checking it

Runs started by the Worker show in GitHub Actions as `workflow_dispatch` events at :07 and :37. Worker logs
are in the Cloudflare dashboard (Workers → zenlot-cron-trigger → Logs).
