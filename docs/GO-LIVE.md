# Going live

Nothing posts until a repository variable is switched on:

| Switch | Turns on |
|---|---|
| `IG_LIVE=true` | Instagram publishing (Mon–Thu 13:00, Sat 14:00 UTC) |
| `AGENTS_LIVE=true` | X and Reddit drafts (emailed for approval unless `AGENTS_AUTOPOST=true`) |

Both run from **`main`**. Turning either on before the work in PR #3 is on `main` would post without the
slide QA, the approval outbox or the preview lock.

## 1. Run the check

**Actions → Zenlot Instagram → Run workflow → job_type: `golive-check`** (or `npm run golive:check` locally).
It is read-only and prints one line per item:

| Mark | Meaning |
|---|---|
| ❌ FAIL | Blocks go-live. The workflow run fails. |
| ☐ TODO | A manual step only a person can do. Record it in `content/go-live.json`. |
| ⚠️ WARN | Won't break anything, but fix it soon. |
| ✅ PASS | Done. |

## 2. What it checks

| Area | What has to be true |
|---|---|
| Code | It runs from `main`, and `main` has the QA gate (PR #3 merged). |
| Calendar | Every post due in the next 8 days passes slide QA. Past-due posts are listed, because the first live run marks them missed. Captions that say "as Monday's maths showed" are flagged if Monday's post won't run. |
| Instagram | The token works and publishing is allowed. |
| Profile | There is a link in bio (posts say "link in bio"), set to `info.zenlot.net/ig` so installs are tracked. The bio says Zenlot never DMs for money. See [PROFILE.md](PROFILE.md). |
| Insights | Published posts don't show 0 reach in the calendar (the planner learns from these numbers). |
| Images / Email | R2 hosting and SMTP are configured, so previews, change notices and drafts actually arrive. |
| Approval | A second person gets the previews. |
| Comments | Someone owns replying to comments in the first hours after each post. |
| Baseline | Four weeks of installs by source were exported before launch, so Instagram's effect can be measured. |

## 3. Record the manual steps

Fill in `content/go-live.json` on `main`:

```json
{
  "backupApprover": "Name <email>",
  "commentsOwner": "Name",
  "accountStatusCheckedAt": "2026-11-23",
  "installBaselineAt": "2026-11-23"
}
```

- **accountStatusCheckedAt**: in the Instagram app, open Settings → Account status. Check that nothing is
  restricted and that posts can be recommended to non-followers.
- **installBaselineAt**: App Store Connect (App Analytics → Acquisition → Sources) and Play Console
  (Statistics → Acquisition by source), last 28 days.
- **backupApprover**: or add their address to the `EMAIL_TO` secret, comma-separated.

## 4. Switch on

1. Run `golive-check` again. It should end with **READY** or **ALMOST** with no ❌.
2. Settings → Secrets and variables → Actions → Variables → `IG_LIVE` = `true`.
3. The next publisher run (13:07, 14:07 or 18:07 UTC) posts whatever is due.

Going away? Set `OWNER_AWAY` to `true` instead ([INCIDENTS.md](INCIDENTS.md)).

To stop everything, delete the variable or set it to anything other than `true`.

## Editing a post after the Sunday preview

The preview email fingerprints each post: its text, how its slides look, and every slide's alt text. If any of that
changes afterwards (an edit, or a template, font, screenshot or image-conversion change), or the post was never
previewed, the publisher emails you a fresh preview of exactly what will go out and waits 3 hours before publishing.

To send the preview straight away, so the 3 hours start now:

1. `git pull`, so you have the calendar the publisher uses.
2. Edit the post, then run `npm run ig:repreview` with `DRY_RUN=false` and the SMTP settings.
3. Commit and push `content/instagram/calendar/`. Until you push, the publisher doesn't know you saw the preview.

To stop a post, set its `"status"` to `"skipped"`.
