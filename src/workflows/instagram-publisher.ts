import crypto from 'crypto';
import { env } from '../config/env';
import { LiveCheckError, instagramService } from '../services/social/instagram.service';
import { storageService } from '../services/storage.service';
import { isoWeekId, loadCalendar, publishedMediaIds, saveCalendar } from '../instagram/calendar';
import { renderHash, renderPost } from '../instagram/renderer';
import { refreshInsights } from '../instagram/insights';
import { recordAccountDay } from '../instagram/account';
import { qaPost } from '../instagram/qa';
import { postAltTexts } from '../instagram/alt-text';
import { CHANGE_HOLD_MS, MAX_LATENESS_MS, canStillPublish, markPreviewed, previewMismatch, scheduleProblem } from '../instagram/approval';
import { sendChangePreview, sendMissedNotice } from '../instagram/preview';
import { AWAY_REASON, skipWhileAway } from '../instagram/away';
import { renderReshareStory } from '../instagram/reshare-story';
import type { CalendarPost, WeekCalendar } from '../instagram/types';

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

const MAX_PUBLISHES_PER_RUN = 2;
const MAX_ATTEMPTS = 3;
const LIVE_MATCH_MS = 14 * 86400_000; // how far before its slot a live post can still be this one

function hashtagsBlock(post: CalendarPost): string {
  return post.hashtags.length ? `\n\n${post.hashtags.map((t) => `#${t}`).join(' ')}` : '';
}

async function publishPost(week: string, post: CalendarPost): Promise<void> {
  // Re-check at publish time: the calendar may have been hand-edited after the Sunday review.
  const qa = await qaPost(post);
  if (qa.fixes.length) console.log(`  QA swapped symbols: ${qa.fixes.join('; ')}`);
  if (qa.blocking.length) throw new Error(`Slide QA blocked publishing: ${qa.blocking.join('; ')}`);

  const images = await renderPost(post);
  const caption = `${post.caption.trim()}${hashtagsBlock(post)}`;

  if (env.DRY_RUN) {
    console.log(`  [DRY RUN] would upload ${images.length} image(s) and publish:\n${caption.split('\n').map((l) => `    ${l}`).join('\n')}`);
    const label = STORY_RESHARE_PILLARS[post.pillar];
    if (label) {
      await renderReshareStory(images[0], label); // proves it renders
      console.log(`  [DRY RUN] would also post a "${label}" Story pointing at it`);
    }
    return;
  }

  // Never trust the calendar alone: if an earlier run published this and its record was lost, take the live post.
  // Posts the calendar already accounts for, or much older ones, are repeats of the same text, not this post.
  const match = { since: new Date(Date.parse(post.scheduledAt) - LIVE_MATCH_MS), exclude: publishedMediaIds(post.id) };
  const live = await instagramService.findPublished(caption, match);
  if (live) {
    post.status = 'published';
    post.published = { mediaId: live.mediaId, permalink: live.permalink, publishedAt: live.timestamp ? new Date(live.timestamp).toISOString() : new Date().toISOString(), imageUrls: [] };
    delete post.lastError;
    console.warn(`  ⚠️  Already live at ${live.permalink ?? live.mediaId}; recorded it instead of publishing again (no Story posted)`);
    return;
  }

  const imageUrls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const hash = crypto.createHash('sha256').update(images[i]).digest('hex').slice(0, 12);
    imageUrls.push(await storageService.uploadJpeg(`instagram/${week}/${post.id}/${i + 1}-${hash}.jpg`, images[i]));
  }
  console.log(`  Uploaded ${imageUrls.length} image(s) to R2`);

  const { mediaId, permalink } = await instagramService.publish(imageUrls, caption, postAltTexts(post), match);
  post.status = 'published';
  post.published = { mediaId, permalink, publishedAt: new Date().toISOString(), imageUrls };
  delete post.lastError;
  console.log(`  ✅ Published ${permalink ?? mediaId}`);

  await postReshareStory(week, post, images[0]);
}

// Pillars whose posts also get a Story pointing at them, labelled for their Highlight.
// The API can't add a Story to a Highlight; that step stays manual (docs/PROFILE.md).
const STORY_RESHARE_PILLARS: Partial<Record<CalendarPost['pillar'], string>> = {
  'risk-math': 'Risk maths',
};

/** Posts the reshare Story for a just-published post. Never throws: the post is already live. */
async function postReshareStory(week: string, post: CalendarPost, cover: Buffer): Promise<void> {
  const label = STORY_RESHARE_PILLARS[post.pillar];
  if (!label || !post.published || post.published.storyMediaId) return;
  try {
    const story = await renderReshareStory(cover, label);
    const hash = crypto.createHash('sha256').update(story).digest('hex').slice(0, 12);
    const url = await storageService.uploadJpeg(`instagram/${week}/${post.id}/story-${hash}.jpg`, story);
    const { mediaId } = await instagramService.publishStory(url);
    post.published.storyMediaId = mediaId;
    console.log(`  📖 Story posted (${mediaId}); add it to the "${label}" Highlight in the app`);
  } catch (err) {
    console.warn(`  ⚠️  Story for ${post.id} failed: ${err instanceof Error ? err.message : err}. Post it by hand: npm run ig:reshare, then ig:story`);
  }
}

/** Returns true if that was its last try and it's now missed. */
function recordFailure(post: CalendarPost, err: unknown): boolean {
  if (post.published) {
    // Live posts are never downgraded: that would publish them again.
    console.error(`  ❌ ${post.id}: ${err instanceof Error ? err.message : err} (already published)`);
    return false;
  }
  post.attempts = (post.attempts ?? 0) + 1;
  post.lastError = err instanceof Error ? err.message : String(err);
  post.status = post.attempts >= MAX_ATTEMPTS ? 'missed' : 'failed';
  if (post.status === 'missed') post.missedNotice = `publishing failed ${post.attempts} times, last with: ${post.lastError}`;
  console.error(`  ❌ ${post.id}: ${post.lastError} (attempt ${post.attempts}/${MAX_ATTEMPTS})`);
  return post.status === 'missed';
}

/** Sends a notice. An error counts as "not sent": one broken post must not stop the others. */
async function sendNotice(week: string, post: CalendarPost, reason: string): Promise<boolean> {
  try {
    return await sendMissedNotice(week, post, reason);
  } catch (err) {
    console.error(`  ❌ notice for ${post.id}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Emails that a post was missed. The reason stays on the post until the email goes out, so later runs retry. */
async function notifyMissed(cal: WeekCalendar, post: CalendarPost, reason = post.missedNotice ?? ''): Promise<void> {
  if (!(await sendNotice(cal.week, post, reason))) {
    console.error(`  ❌ notice email for ${post.id} was not sent; retried next run`);
    return;
  }
  if (env.DRY_RUN) return;
  delete post.missedNotice;
  saveCalendar(cal); // the email is out: don't send it again if this run crashes later
}

async function main() {
  // --now <ISO> lets you simulate a run at a specific time (useful with DRY_RUN).
  const nowArg = process.argv.indexOf('--now');
  const now = nowArg >= 0 ? new Date(process.argv[nowArg + 1]) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now is not a valid time');
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
    let cal: WeekCalendar | null;
    try {
      cal = loadCalendar(week);
    } catch (err) {
      // One broken file must not stop the other week.
      failures++;
      console.error(`  ❌ ${week} can't be read: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (!cal) continue;
    let changed = false;

    for (const post of cal.posts) {
      if (post.status === 'missed' && post.missedNotice) await notifyMissed(cal, post);
      if (post.status !== 'scheduled' && post.status !== 'failed') continue;
      if (skipWhileAway(post, now, env.OWNER_AWAY)) {
        console.log(`🌙 ${post.id}: ${AWAY_REASON}`);
        changed = true;
        continue;
      }
      const problem = scheduleProblem(post);
      // Someone put a missed post back on the schedule: it starts again with a clean record.
      if (post.status === 'scheduled' && (post.attempts || post.missedNotice || (post.lastError && post.lastError !== problem))) {
        delete post.attempts;
        delete post.missedNotice;
        delete post.lastError;
        changed = true;
      }
      if (problem) {
        failures++;
        console.error(`  ❌ ${post.id}: ${problem}. Not publishing it until that's fixed.`);
        // Emailed once per problem: the post stays as it is until someone fixes the date.
        if (post.lastError !== problem && (await sendNotice(week, post, problem)) && !env.DRY_RUN) {
          post.lastError = problem;
          saveCalendar(cal);
        }
        continue;
      }
      const due = Date.parse(post.scheduledAt);
      if (due > now.getTime()) continue;

      if (now.getTime() - due > MAX_LATENESS_MS) {
        console.log(`⏭  ${post.id} is ${Math.round((now.getTime() - due) / 3600_000)}h overdue — marking missed`);
        post.status = 'missed';
        post.missedNotice = `no run could publish it within ${MAX_LATENESS_MS / 3600_000} hours of its slot${post.lastError ? ` (last error: ${post.lastError})` : ''}`;
        changed = true;
        await notifyMissed(cal, post);
        continue;
      }
      if (published >= MAX_PUBLISHES_PER_RUN) {
        console.log(`⏸  ${post.id} due but per-run limit reached; next run will take it`);
        continue;
      }

      // What you reviewed is what ships: if the text or the rendered slides changed since the preview,
      // email a new preview and hold the post.
      let fingerprint: string;
      try {
        fingerprint = await renderHash(post);
      } catch (err) {
        // One broken post must not stop the others.
        failures++;
        changed = true;
        if (recordFailure(post, err)) await notifyMissed(cal, post);
        continue;
      }
      const mismatch = previewMismatch(post, fingerprint);
      if (mismatch) {
        const after = new Date(now.getTime() + CHANGE_HOLD_MS);
        if (!canStillPublish(post, after)) {
          console.log(`⏭  ${post.id}: ${mismatch}, and no run is left after a hold — marking missed`);
          const why = `${mismatch}. It needed a preview and a ${CHANGE_HOLD_MS / 3600_000}-hour wait, and that ends too late for its slot`;
          failures++;
          if (!env.DRY_RUN) {
            post.status = 'missed';
            post.lastError = `${mismatch}; too late to preview and hold`;
            post.missedNotice = why;
            changed = true;
          }
          await notifyMissed(cal, post, why);
          continue;
        }
        console.log(`✋ ${post.id}: ${mismatch} — emailing a new preview; it publishes after ${after.toISOString()}`);
        try {
          await sendChangePreview(week, post, after, mismatch);
        } catch (err) {
          // Keep holding: a changed post never publishes until its preview has actually been sent.
          console.error(`  ❌ ${err instanceof Error ? err.message : err}; ${post.id} stays on hold and is retried next run`);
          failures++;
          continue;
        }
        if (!env.DRY_RUN) {
          markPreviewed(post, fingerprint, now);
          saveCalendar(cal); // the email is out: don't send it again if this run crashes later
        }
        continue;
      }
      if (post.previewedAt && now.getTime() - Date.parse(post.previewedAt) < CHANGE_HOLD_MS) {
        console.log(`⏳ ${post.id} was re-previewed at ${post.previewedAt}; waiting out the ${CHANGE_HOLD_MS / 3600_000}h veto window`);
        continue;
      }

      console.log(`📮 ${post.id}: ${post.topic}`);
      try {
        await publishPost(week, post);
      } catch (err) {
        failures++;
        if (err instanceof LiveCheckError) {
          // Not a failed publish: the post stays due and the next run asks again before publishing.
          console.error(`  ❌ ${post.id}: ${err.message}; retried next run`);
          continue;
        }
        changed = true;
        if (recordFailure(post, err)) await notifyMissed(cal, post);
        continue;
      }
      if (!env.DRY_RUN) {
        published++;
        changed = true;
        // Save now in case something later in this run crashes. If the save itself fails the post stays
        // published in memory, is saved again below, and is never treated as a failed publish.
        try {
          saveCalendar(cal);
        } catch (err) {
          failures++;
          console.error(`  ❌ ${post.id} is published but the calendar was not saved: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    // Dry runs never mutate the calendar.
    if (changed && !env.DRY_RUN) saveCalendar(cal);
  }

  // Measurements use the real clock. A simulated run (--now) must never save them under a made-up time.
  if (nowArg >= 0) {
    console.log('Simulated time (--now): skipping insight snapshots and follower history.');
    console.log(`Done: ${published} published, ${failures} failed.`);
    if (failures > 0) process.exitCode = 1;
    return;
  }

  // Freeze 48h / 7d insight snapshots that are due, so the planner can compare posts at equal ages.
  try {
    await refreshInsights(3, { mode: 'snapshots', now });
  } catch (err) {
    console.warn(`[Insights] snapshot step failed: ${err instanceof Error ? err.message : err}`);
  }
  // Follower history (Instagram only gives daily follower counts at 100+ followers).
  try {
    const day = await recordAccountDay(now);
    if (day) console.log(`[Account] ${day.date}: ${day.followers} followers, ${day.posts} posts`);
  } catch (err) {
    console.warn(`[Account] follower snapshot failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log(`Done: ${published} published, ${failures} failed.`);
  if (failures > 0) process.exitCode = 1; // surface failures in GitHub Actions
}

main().catch((err) => {
  console.error('❌ Publisher failed:', err);
  process.exit(1);
});
