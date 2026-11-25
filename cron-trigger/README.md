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

## Warnings

It emails when a publish or plan job can't be started (after 3 tries), and at 19:37 UTC when a post is 5 hours overdue,
a plan is missing, comments couldn't be started, or `GITHUB_TOKEN` expires in 14, 7, 3 or fewer days. Until email is set
up, these are only in the Worker's logs.

To set up email:

1. Cloudflare dashboard → Compute → Email Service → Email Sending → Onboard Domain. Use a **subdomain**
   (`alerts.zenlot.net`). **Don't enable Email Routing on `zenlot.net`**: it replaces the MX records, and Hostinger
   handles that mail.
2. Email Routing → Destination Addresses: add the address for the warnings and verify it. (Cloudflare says sending to verified
   addresses is free; onboarding a sending domain may need the Workers Paid plan.)
3. Uncomment the email lines in `wrangler.toml`, run `npx wrangler secret put ALERT_TO`, then `npx wrangler deploy`.

Separately, `.github/workflows/instagram-watch.yml` does the same checks from GitHub with the existing SMTP settings, and
warns if this Worker has started nothing for 26 hours (runs you start by hand count as activity). GitHub can run it hours
late. If GitHub's schedule and the Worker both stop, only someone looking would notice.

## Changing times

Edit the cron in three places together: `wrangler.toml` `[triggers]`, `CRONS` in `src/index.ts`, and the
workflow's `schedule:`. Then `npx wrangler deploy` from this folder.

## Checking it

Runs started by the Worker show in GitHub Actions as `workflow_dispatch` events at :07 and :37. Worker logs
are in the Cloudflare dashboard (Workers → zenlot-cron-trigger → Logs).
