import crypto from 'crypto';
import path from 'path';
import { env } from '../config/env';
import { emailService } from '../services/email.service';
import { instagramService } from '../services/social/instagram.service';
import { storageService } from '../services/storage.service';
import { isoWeekId, loadCalendar, saveCalendar } from '../instagram/calendar';
import { renderPost } from '../instagram/renderer';
import { refreshInsights } from '../instagram/insights';
import { qaPost } from '../instagram/qa';
import { postAltTexts } from '../instagram/alt-text';
import { CHANGE_HOLD_MS, contentHash, markPreviewed } from '../instagram/approval';
import { editLink, esc, postSectionHtml, type Attachment } from '../instagram/preview';
import type { CalendarPost } from '../instagram/types';

// ---------------------------------------------------------------------------
// Instagram publisher — runs a few times a day. Publishes every post whose
// time has come and that a human hasn't marked "skipped".
//
// Images are rendered fresh from the calendar JSON at publish time. If a post
// changed after it was previewed, a new preview is emailed first and the post
// waits CHANGE_HOLD_MS (see approval.ts), so what ships is what was reviewed.
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
  const qa = await qaPost(post);
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

  const { mediaId, permalink } = await instagramService.publish(imageUrls, caption, postAltTexts(post));
  post.status = 'published';
  post.published = { mediaId, permalink, publishedAt: new Date().toISOString(), imageUrls };
  delete post.lastError;
  console.log(`  ✅ Published ${permalink ?? mediaId}`);
}

/** Emails a preview of a post that changed after the last preview. */
async function sendChangePreview(week: string, post: CalendarPost, publishAfter: Date): Promise<void> {
  const images = await renderPost(post.slides);
  const qa = await qaPost(post);
  const attachments: Attachment[] = [];
  const section = postSectionHtml(post, images, attachments, qa.blocking);
  const after = publishAfter.toUTCString().replace(':00 GMT', ' UTC');
  const edit = editLink(week);
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:900px;color:#111">
<h2 style="margin-bottom:4px">A scheduled Instagram post changed</h2>
<p style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:8px;font-size:14px">
<code>${esc(post.id)}</code> is different from the version you last saw. This is exactly what will be published,
at the first run after <b>${esc(after)}</b>. To stop it, set its <code>"status"</code> to <code>"skipped"</code>
${edit ? `in <a href="${edit}">the calendar file</a>` : `in <code>content/instagram/calendar/${week}.json</code>`}.</p>
${section}</div>`;
  await emailService.sendHtml(
    `[Zenlot IG] Changed after preview: ${post.id} publishes after ${after}`,
    html,
    attachments,
    path.join('out', 'instagram', week, `changed-${post.id}.html`),
  );
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

      // What you reviewed is what ships: a post edited since its preview gets a new preview and a hold.
      if (post.previewHash && post.previewHash !== contentHash(post)) {
        const after = new Date(now.getTime() + CHANGE_HOLD_MS);
        console.log(`✋ ${post.id} changed since it was previewed — emailing a new preview; it publishes after ${after.toISOString()}`);
        await sendChangePreview(week, post, after);
        if (!env.DRY_RUN) {
          markPreviewed(post, now);
          changed = true;
        }
        continue;
      }
      if (post.previewedAt && now.getTime() - Date.parse(post.previewedAt) < CHANGE_HOLD_MS) {
        console.log(`⏳ ${post.id} was re-previewed at ${post.previewedAt}; waiting out the ${CHANGE_HOLD_MS / 3600_000}h veto window`);
        continue;
      }
      if (!post.previewHash) console.warn(`⚠️  ${post.id} has no preview fingerprint (planned before previews were tracked)`);

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

  // Freeze 48h / 7d insight snapshots that are due, so the planner can compare posts at equal ages.
  try {
    await refreshInsights(3, { mode: 'snapshots', now });
  } catch (err) {
    console.warn(`[Insights] snapshot step failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log(`Done: ${published} published, ${failures} failed.`);
  if (failures > 0) process.exitCode = 1; // surface failures in GitHub Actions
}

main().catch((err) => {
  console.error('❌ Publisher failed:', err);
  process.exit(1);
});
