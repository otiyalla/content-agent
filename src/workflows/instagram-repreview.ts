import { env } from '../config/env';
import { CHANGE_HOLD_MS, contentHash, markPreviewed } from '../instagram/approval';
import { isoWeekId, loadCalendar, saveCalendar } from '../instagram/calendar';
import { sendChangePreview } from '../instagram/preview';

// ---------------------------------------------------------------------------
// After editing a scheduled post, run this to email its preview straight away
// instead of waiting for the publisher to notice when the post is due. The
// 3-hour veto window then starts now, so an early edit doesn't delay the post.
//
//   npm run ig:repreview          # this week and next
//   DRY_RUN=true npm run ig:repreview   # write previews to out/ without emailing or saving
// ---------------------------------------------------------------------------

async function main() {
  const now = new Date();
  const weeks = [...new Set([isoWeekId(now), isoWeekId(new Date(now.getTime() + 7 * 86400_000))])];
  let sent = 0;
  for (const week of weeks) {
    const cal = loadCalendar(week);
    if (!cal) continue;
    let changed = false;
    for (const post of cal.posts) {
      if (post.status !== 'scheduled' && post.status !== 'failed') continue;
      if (post.previewHash === contentHash(post)) continue;
      const after = new Date(Math.max(Date.parse(post.scheduledAt), now.getTime() + CHANGE_HOLD_MS));
      console.log(`✉️  ${post.id} changed since its last preview — sending it now (publishes ${after.toISOString()})`);
      try {
        await sendChangePreview(week, post, after);
      } catch (err) {
        console.error(`  ❌ ${err instanceof Error ? err.message : err}. Not marked as previewed; run again.`);
        process.exitCode = 1;
        continue;
      }
      sent++;
      if (!env.DRY_RUN) {
        markPreviewed(post, now);
        changed = true;
      }
    }
    if (changed) saveCalendar(cal);
  }
  console.log(sent ? `✅ ${sent} preview(s) ${env.DRY_RUN ? 'written' : 'emailed'}` : 'Nothing changed since the last previews.');
}

main().catch((err) => {
  console.error('❌ Re-preview failed:', err);
  process.exit(1);
});
