import crypto from 'crypto';
import { env } from '../config/env';
import { instagramService } from '../services/social/instagram.service';
import { storageService } from '../services/storage.service';
import { isoWeekId, loadCalendar, saveCalendar } from '../instagram/calendar';
import { renderPost } from '../instagram/renderer';
import { qaPost } from '../instagram/qa';
import type { CalendarPost } from '../instagram/types';

// ---------------------------------------------------------------------------
// Instagram publisher — runs a few times a day. Publishes every post whose
// time has come and that a human hasn't marked "skipped".
//
// Images are rendered fresh from the calendar JSON at publish time, so any
// edits made after the Sunday preview are honoured.
//
//   npm run ig:publish
//   DRY_RUN=true npm run ig:publish -- --now 2026-11-23T13:07:00Z
// ---------------------------------------------------------------------------

// A post that couldn't go out within this window is marked "missed" rather than
// published late (a Monday post landing on Wednesday crowds the next one).
const MAX_LATENESS_MS = 30 * 3600_000;
const MAX_PUBLISHES_PER_RUN = 2;
const MAX_ATTEMPTS = 3;

function hashtagsBlock(post: CalendarPost): string {
  return post.hashtags.length ? `\n\n${post.hashtags.map((t) => `#${t}`).join(' ')}` : '';
}

async function publishPost(week: string, post: CalendarPost): Promise<void> {
  // Re-check at publish time: the calendar may have been hand-edited after the Sunday review.
  const qa = qaPost(post);
  if (qa.fixes.length) console.log(`  QA swapped symbols: ${qa.fixes.join('; ')}`);
  if (qa.blocking.length) throw new Error(`Slide QA blocked publishing: ${qa.blocking.join('; ')}`);

  const images = await renderPost(post.slides);
  const caption = `${post.caption.trim()}${hashtagsBlock(post)}`;

  if (env.DRY_RUN) {
    console.log(`  [DRY RUN] would upload ${images.length} image(s) and publish:\n${caption.split('\n').map((l) => `    ${l}`).join('\n')}`);
    return;
  }

  const imageUrls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const hash = crypto.createHash('sha256').update(images[i]).digest('hex').slice(0, 12);
    imageUrls.push(await storageService.uploadJpeg(`instagram/${week}/${post.id}/${i + 1}-${hash}.jpg`, images[i]));
  }
  console.log(`  Uploaded ${imageUrls.length} image(s) to R2`);

  const { mediaId, permalink } = await instagramService.publish(imageUrls, caption, post.altText);
  post.status = 'published';
  post.published = { mediaId, permalink, publishedAt: new Date().toISOString(), imageUrls };
  delete post.lastError;
  console.log(`  ✅ Published ${permalink ?? mediaId}`);
}

async function main() {
  // --now <ISO> lets you simulate a run at a specific time (useful with DRY_RUN).
  const nowArg = process.argv.indexOf('--now');
  const now = nowArg >= 0 ? new Date(process.argv[nowArg + 1]) : new Date();
  console.log(`📤 Instagram publisher — ${now.toISOString()}${env.DRY_RUN ? ' [DRY RUN]' : ''}`);

  if (!env.DRY_RUN && (!instagramService.configured || !storageService.configured)) {
    throw new Error('Instagram and R2 must both be configured to publish (or set DRY_RUN=true).');
  }

  // Look at this week and last week (covers posts scheduled late Sunday).
  const lastWeekDate = new Date(now.getTime() - 7 * 86400_000);
  const weeks = [...new Set([isoWeekId(lastWeekDate), isoWeekId(now)])];

  let published = 0;
  let failures = 0;

  for (const week of weeks) {
    const cal = loadCalendar(week);
    if (!cal) continue;
    let changed = false;

    for (const post of cal.posts) {
      if (post.status !== 'scheduled' && post.status !== 'failed') continue;
      const due = Date.parse(post.scheduledAt);
      if (due > now.getTime()) continue;

      if (now.getTime() - due > MAX_LATENESS_MS) {
        console.log(`⏭  ${post.id} is ${Math.round((now.getTime() - due) / 3600_000)}h overdue — marking missed`);
        post.status = 'missed';
        changed = true;
        continue;
      }
      if (published >= MAX_PUBLISHES_PER_RUN) {
        console.log(`⏸  ${post.id} due but per-run limit reached; next run will take it`);
        continue;
      }

      console.log(`📮 ${post.id}: ${post.topic}`);
      try {
        await publishPost(week, post);
        if (!env.DRY_RUN) {
          published++;
          changed = true;
        }
      } catch (err) {
        failures++;
        post.attempts = (post.attempts ?? 0) + 1;
        post.lastError = err instanceof Error ? err.message : String(err);
        post.status = post.attempts >= MAX_ATTEMPTS ? 'missed' : 'failed';
        changed = true;
        console.error(`  ❌ ${post.lastError} (attempt ${post.attempts}/${MAX_ATTEMPTS})`);
      }
    }

    // Dry runs never mutate the calendar.
    if (changed && !env.DRY_RUN) saveCalendar(cal);
  }

  console.log(`Done: ${published} published, ${failures} failed.`);
  if (failures > 0) process.exitCode = 1; // surface failures in GitHub Actions
}

main().catch((err) => {
  console.error('❌ Publisher failed:', err);
  process.exit(1);
});
