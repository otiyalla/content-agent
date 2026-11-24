# Incidents

One page for when something goes wrong. Check it once a year, and the links with it.

## Pause switches

| To stop | Do this (GitHub → Settings → Secrets and variables → Actions → Variables) |
|---|---|
| All Instagram publishing | Set `IG_LIVE` to anything but `true` |
| Everything while you're away | Set `OWNER_AWAY` to `true` |
| X and Reddit drafts and posts | Set `AGENTS_LIVE` to anything but `true` |
| One post | Set its `"status"` to `"skipped"` in the calendar file |

**While `OWNER_AWAY` is `true`:** nothing publishes, no drafts are sent, and a post that comes due is marked `skipped`
(it won't burst out when you return; set a new time and `scheduled` to run it). The comment digest keeps going, and
also goes to the `SAFETY_BACKUP_EMAIL` secret. Set that secret first. Nothing can tell that an email went unread, so
the switch is yours to flip.

## Severity

| Level | Examples | First move |
|---|---|---|
| **S1** now | Someone may be in danger. Account hacked. An impostor is taking money. | Act within the hour. Pause publishing. |
| **S2** today | Wrong maths or a wrong claim is live. A partner promotes signals. Meta warning or action block. Regulator or press asks something. | Pause publishing and that activity. |
| **S3** this week | A rude thread, a small typo, a confused user. | Handle it normally. |

Always **save evidence first** (screenshot, link, time in UTC), then act. Only the owner speaks for Zenlot to press,
regulators or lawyers; everyone else says "I'll pass this on".

## What to do

**Someone may be in danger.** Reply with care, as a person. Encourage them to contact local emergency services or a
helpline now: <https://findahelpline.com> lists them by country. Use Instagram's own report option
(⋯ → Report → Suicide or self-injury), which offers them help. Don't hide the comment, don't mention Zenlot, don't
teach. Check back within 24 hours.

**Wrong maths or claim in a live post.** Comment and pin a correction, then decide whether to archive the post:

> Correction: slide [n] said [wrong]. It should be [right], because [one line]. Thanks to [those] who spotted it.

**Account hacked.** From a trusted device: <https://www.instagram.com/hacked>. Then remove unknown sessions, change the
password, check 2FA, and in Meta Business settings revoke and reissue the system-user token (`IG_ACCESS_TOKEN`). Set
`IG_LIVE` off until done. Tell followers on another channel if money was asked for.

**Impostor.** Report it: profile → ⋯ → Report → Pretending to be someone → Me or my business. Post the safety line as
a Story. Ask people who paid to contact their bank and local police.

**Partner starts promoting signals or broker links.** Untag or archive the shared post, say why in one line if asked,
and don't argue in public.

**Action block.** Stop commenting for 72 hours, then at most one a day for a week. A second block within 30 days stops
commenting. **Meta warning:** stop everything and read Settings → Account status.

## Owner's checklist

- [ ] A second admin on the Meta business portfolio, and 2FA on every admin
- [ ] `SAFETY_BACKUP_EMAIL` set, and that person has read this page
- [ ] Recovery email and phone on Instagram are current
- [ ] Instagram token type and permissions written down (`npm run ig:whoami`)
- [ ] Expiry dates in your calendar: Cloudflare Worker's `GITHUB_TOKEN`, SMTP password
