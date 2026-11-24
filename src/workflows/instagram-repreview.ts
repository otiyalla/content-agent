import { env } from '../config/env';
import { CHANGE_HOLD_MS, canStillPublish, markPreviewed, previewMismatch } from '../instagram/approval';
import { renderHash } from '../instagram/renderer';
import { isoWeekId, loadCalendar, saveCalendar } from '../instagram/calendar';
import { sendChangePreview } from '../instagram/preview';

// ---------------------------------------------------------------------------
// After editing a scheduled post, run this to email its preview straight away
// instead of waiting for the publisher to notice when the post is due. The
// 3-hour veto window then starts now, so an early edit doesn't delay the post.
//
//   git pull
//   DRY_RUN=false npm run ig:repreview   # emails this week's and next week's changed posts
//   git add content/instagram/calendar
//   git commit -m "ig: re-preview" -- content/instagram/calendar && git push   # the publisher reads the pushed calendar
//   DRY_RUN=true npm run ig:repreview   # write previews to out/ without emailing or saving
// ---------------------------------------------------------------------------

async function main() {
  const now = new Date();
  const weeks = [...new Set([isoWeekId(now), isoWeekId(new Date(now.getTime() + 7 * 86400_000))])];
  let sent = 0;
  let failed = 0;
  for (const week of weeks) {
    const cal = loadCalendar(week);
    if (!cal) continue;
    for (const post of cal.posts) {
      if (post.status !== 'scheduled' && post.status !== 'failed') continue;
      try {
        const fingerprint = await renderHash(post);
        const mismatch = previewMismatch(post, fingerprint);
        if (!mismatch) continue;
        const after = new Date(Math.max(Date.parse(post.scheduledAt), now.getTime() + CHANGE_HOLD_MS));
        if (!canStillPublish(post, after)) {
          throw new Error(`too late to preview: no publisher run is left before its slot expires. Change its "scheduledAt" or set its "status" to "skipped"`);
        }
        console.log(`✉️  ${post.id}: ${mismatch} — sending a preview now (publishes ${after.toISOString()})`);
        await sendChangePreview(week, post, after, mismatch);
        sent++;
        if (!env.DRY_RUN) {
          markPreviewed(post, fingerprint, now);
          saveCalendar(cal); // after each email, so a later crash can't forget it
        }
      } catch (err) {
        failed++;
        console.error(`  ❌ ${post.id}: ${err instanceof Error ? err.message : err}. Not marked as previewed; fix it and run again.`);
        process.exitCode = 1;
      }
    }
  }
  if (sent) {
    console.log(`✅ ${sent} preview(s) ${env.DRY_RUN ? 'written' : 'emailed'}`);
    if (!env.DRY_RUN) console.log('Now commit and push content/instagram/calendar, or the publisher will send them again and restart the 3 hours.');
  } else if (!failed) console.log('Nothing changed since the last previews.');
}

main().catch((err) => {
  console.error('❌ Re-preview failed:', err);
  process.exit(1);
});
