import path from 'path';
import { env } from '../config/env';
import { emailService } from '../services/email.service';
import { instagramService } from '../services/social/instagram.service';
import {
  WEEKLY_SLOTS,
  isoWeekId,
  loadCalendar,
  recentPosts,
  saveCalendar,
  slotTime,
  weekToPlan,
} from '../instagram/calendar';
import { refreshInsights } from '../instagram/insights';
import { FOLLOWER_GOAL, followerChange, latestFollowers, recordAccountDay } from '../instagram/account';
import { recordAccountWeek } from '../instagram/account-metrics';
import { readBrief, safeField } from '../instagram/brief';
import { renderHash, renderPost } from '../instagram/renderer';
import { qaPost } from '../instagram/qa';
import { markPreviewed } from '../instagram/approval';
import { editLink, repoLink, esc, postSectionHtml, type Attachment } from '../instagram/preview';
import { planWeek } from '../instagram/strategist';
import { reportSent, markReportSent } from '../instagram/report-state';
import type { CalendarPost, WeekCalendar } from '../instagram/types';

// ---------------------------------------------------------------------------
// Instagram weekly planner — runs Sunday.
//
//   1. Pull fresh insights for recent posts (the "social media manager" loop)
//   2. Ask the strategist (Claude Opus 5.5) to plan next week, informed by them
//   3. Save the calendar to content/instagram/calendar/<week>.json
//   4. Render every slide and email the team a full preview
//
// Last week's report is a separate email, sent before planning, so it arrives
// even if planning fails or the week was planned by hand.
//
// Posts then auto-publish on schedule unless someone sets "status": "skipped".
// A post that breaks a brand, maths or advice rule is saved as "skipped" with
// the reason in "held"; the rest of the week goes ahead.
//
// Usage:
//   npm run ig:plan                         # plan next week
//   npm run ig:plan -- --week 2026-W48      # plan a specific week
//   npm run ig:plan -- --force              # overwrite an existing plan
//   IG_PLAN_NOTES="NFP is Friday" npm run ig:plan
//   IG_PLAN_NOTES="[brief:q07 slot:mon] ..."   # lead one post with a reader question (docs/RADAR-PILOT.md)
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mondayFromWeekId(week: string): Date {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return monday;
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Account growth for the email: follower change from recorded history, plus last 7 days of profile activity. */
async function growthHtml(now: Date): Promise<string> {
  const f = followerChange(7, now);
  let activity = '';
  try {
    const a = await instagramService.getAccountInsights(new Date(now.getTime() - 7 * 86400_000), now);
    if (!env.DRY_RUN) recordAccountWeek(a, now);
    activity = ` · last 7 days: <b>${a.profileViews ?? '–'}</b> profile views, <b>${a.websiteClicks ?? '–'}</b> link-in-bio taps, reach ${a.reach ?? '–'}`;
  } catch (err) {
    console.warn(`Could not fetch account insights: ${err instanceof Error ? err.message : err}`);
  }
  if (f.now === undefined) return `<p style="color:#666">No follower history yet${activity}.</p>`;
  const sign = (f.change ?? 0) > 0 ? '+' : '';
  const left = FOLLOWER_GOAL - f.now;
  const guide = repoLink('docs/FIRST-FOLLOWERS.md');
  const goal = left > 0 ? `<p style="font-size:13px;color:#445">${left} to go to ${FOLLOWER_GOAL}. By-hand steps: ${guide ? `<a href="${guide}">first followers guide</a>` : 'docs/FIRST-FOLLOWERS.md'}.</p>` : '';
  return `<p style="font-size:15px">Followers: <b>${f.now}</b> (${sign}${f.change} in 7 days)${activity}</p>${goal}`;
}

function reportHtml(posts: CalendarPost[]): string {
  const published = posts.filter((p) => p.status === 'published');
  if (published.length === 0) return '<p style="color:#666">No published posts with metrics yet.</p>';
  const rows = published
    .map((p) => {
      const i = p.insights ?? ({} as NonNullable<CalendarPost['insights']>);
      const title = esc(p.slides[0]?.title.replace(/\*\*/g, '') ?? p.topic);
      const link = p.published?.permalink ? `<a href="${p.published.permalink}">${title}</a>` : title;
      const ageH = p.published && i.fetchedAt ? Math.round((Date.parse(i.fetchedAt) - Date.parse(p.published.publishedAt)) / 3600_000) : null;
      const age = ageH === null ? '–' : ageH < 48 ? `${ageH}h` : `${Math.round(ageH / 24)}d`;
      return `<tr><td>${p.id.split('-').pop()}</td><td>${link}</td><td>${age}</td><td>${i.reach ?? '–'}</td><td><b>${i.follows ?? '–'}</b></td><td>${i.profileVisits ?? '–'}</td><td>${i.linkTaps === undefined ? '–' : `${i.linkTapsFrom ? '≥' : ''}${i.linkTaps}`}</td><td>${i.saved ?? '–'}</td><td>${i.shares ?? '–'}</td><td>${i.likes ?? '–'}</td><td>${i.comments ?? '–'}</td></tr>`;
    })
    .join('');
  return `<p style="color:#667;font-size:12px;margin:0 0 6px">Latest numbers. Posts of different ages aren't comparable; the planner compares them at 7 days.</p>
<table cellpadding="6" style="border-collapse:collapse;font-size:13px">
<tr style="background:#f2f4f7;text-align:left"><th>Day</th><th>Post</th><th>Age</th><th>Reach</th><th>Follows</th><th>Profile visits</th><th>Link taps</th><th>Saves</th><th>Shares</th><th>Likes</th><th>Comments</th></tr>${rows}</table>`;
}

/** Emails last week's results. Once per week: late duplicate runs find it already sent. Returns false if the email failed. */
async function sendReport(now: Date): Promise<boolean> {
  // The week just ending on a Sunday, or just ended on a Monday. Not the planned week: --force moves that.
  const lastWeek = isoWeekId(new Date(now.getTime() - (now.getUTCDay() === 1 ? 86400_000 : 0)));
  if (reportSent(lastWeek)) return true;
  let growth = '';
  if (instagramService.configured) {
    try {
      await recordAccountDay(now);
    } catch (err) {
      console.warn(`Could not record followers: ${err instanceof Error ? err.message : err}`);
    }
    growth = await growthHtml(now);
  }
  const ok = await emailService.sendHtml(
    `[Zenlot IG] Results for ${lastWeek}`,
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:900px;color:#111">
<h2>Instagram results for ${esc(lastWeek)}</h2>
${growth}
${reportHtml(loadCalendar(lastWeek)?.posts ?? [])}
</div>`,
    [],
    path.join('out', 'instagram', lastWeek, 'report.html'),
  );
  if (ok && !env.DRY_RUN) markReportSent(lastWeek, now);
  return ok;
}

async function main() {
  const now = new Date();
  const force = process.argv.includes('--force');
  const weekMonday = arg('week') ? mondayFromWeekId(arg('week')!) : weekToPlan(now, force);
  const week = isoWeekId(weekMonday);
  const weekEnd = new Date(weekMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekLabel = `${week} (${fmtDay(weekMonday)} – ${fmtDay(weekEnd)})`;

  console.log(`📅 Instagram planner — ${weekLabel}${env.DRY_RUN ? ' [DRY RUN]' : ''}`);

  // 1. Performance feedback loop. Always runs, even when next week is already
  //    planned, so the calendar keeps collecting reach/saves/shares every Sunday.
  await refreshInsights(4);

  // 2. Last week's report, on the weekly run only (Sunday, or Monday if it was late). Never stops the planning.
  if (!arg('week') && [0, 1].includes(now.getUTCDay())) {
    try {
      if (!(await sendReport(now))) throw new Error('the email was not sent');
    } catch (err) {
      console.error(`❌ Weekly report: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }

  if (loadCalendar(week) && !force) {
    console.log(
      now.getUTCDay() === 1 && !arg('week')
        ? `Calendar for ${week} (this week) already exists. On a Monday, --force plans next week; this week is never overwritten.`
        : `Calendar for ${week} already exists. Use --force to re-plan.`,
    );
    return;
  }
  // Checked before anything is spent: notes appear in public logs and steer public plans.
  const brief = readBrief(process.env.IG_PLAN_NOTES, WEEKLY_SLOTS);
  const history = recentPosts(6);

  let account = '';
  let followers = latestFollowers();
  if (instagramService.configured) {
    try {
      const a = await instagramService.getAccount();
      followers = a.followers_count ?? followers;
      account = `@${a.username}: ${a.followers_count ?? '?'} followers, ${a.media_count ?? '?'} posts`;
      console.log(`Account: ${account}`);
    } catch (err) {
      console.warn(`Could not fetch account info: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 3. Plan
  console.log('🧠 Planning the week with the strategist...');
  const plan = await planWeek({ weekLabel, slots: WEEKLY_SLOTS, recentPosts: history, notes: process.env.IG_PLAN_NOTES, followers, weekStart: weekMonday });

  // 4. Save calendar. The file is public, so planning fields that would leak are replaced (never the post itself).
  const scrub = (where: string, text: string, fallback: string) => {
    const safe = safeField(text, fallback);
    if (safe.problems.length) plan.warnings.push(`${where} was replaced: it ${safe.problems.join('; ')}`);
    return safe.text;
  };
  const calendar: WeekCalendar = {
    week,
    theme: scrub('theme', plan.theme, 'Weekly plan'),
    generatedAt: new Date().toISOString(),
    posts: plan.posts.map(({ post: { slot, ...post }, held }) => {
      const s = WEEKLY_SLOTS[slot];
      post.topic = scrub(`${s.day} topic`, post.topic, `${s.series}: ${post.slides[0]?.title.replace(/\*\*/g, '') ?? ''}`);
      post.rationale = scrub(`${s.day} rationale`, post.rationale, '');
      const base = { id: `${week}-${s.day}`, scheduledAt: slotTime(weekMonday, s).toISOString(), ...(brief?.day === s.day ? { briefId: brief.id } : {}) };
      return held.length ? { ...base, status: 'skipped' as const, held, ...post } : { ...base, status: 'scheduled' as const, ...post };
    }),
  };
  const heldPosts = calendar.posts.filter((p) => p.held);
  for (const p of heldPosts) console.warn(`✋ ${p.id} held: ${p.held!.join('; ')}`);
  // Saved before rendering so a render or email failure never loses the plan. Posts are marked as
  // previewed only once the email below has been sent; until then the publisher holds them.
  const file = saveCalendar(calendar);
  console.log(`💾 Saved ${path.relative(process.cwd(), file)} — theme: "${calendar.theme}"`);

  // 5. Render + email preview
  console.log('🎨 Rendering preview...');
  const attachments: Attachment[] = [];
  const sections: string[] = [];
  const fingerprints = new Map<CalendarPost, string>();
  for (const post of calendar.posts) {
    try {
      const fingerprint = await renderHash(post);
      const images = await renderPost(post);
      const qa = await qaPost(post);
      sections.push(postSectionHtml(post, images, attachments, [...new Set([...(post.held ?? []), ...qa.blocking])]));
      // Held posts aren't marked as previewed, so releasing one sends a fresh preview and waits 3 hours.
      if (!post.held) fingerprints.set(post, fingerprint);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${post.id} could not be rendered: ${message}`);
      sections.push(`<p style="color:#991b1b"><b><code>${esc(post.id)}</code> could not be rendered and won't publish until fixed:</b> ${[...(post.held ?? []), message].map(esc).join('; ')}</p>`);
    }
  }

  const edit = editLink(week);
  const ready = calendar.posts.length - heldPosts.length;
  const heldHtml = heldPosts.length
    ? `<p style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:10px 12px;border-radius:8px;font-size:14px"><b>Held, won't publish:</b> ${heldPosts.map((p) => `<code>${esc(p.id)}</code>`).join(', ')}. The reason is on each post below. Fix it in the calendar file and set <code>"status"</code> to <code>"scheduled"</code>; you'll get a fresh preview and it waits 3 hours.</p>`
    : '';
  const warningsHtml = plan.warnings.length
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;padding:10px 12px;border-radius:8px;font-size:14px"><b>Worth a look</b> (these don't stop anything):<ul style="margin:6px 0 0">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
    : '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:900px;color:#111">
<h2 style="margin-bottom:4px">Instagram plan for ${esc(weekLabel)}</h2>
<p style="margin-top:0;color:#445">Theme: <b>${esc(calendar.theme)}</b>${account ? ` · ${esc(account)}` : ''}</p>
<p style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:8px;font-size:14px">
These posts publish automatically at the times shown. To stop one, set its <code>"status"</code> to <code>"skipped"</code>
${edit ? `in <a href="${edit}">the calendar file</a>` : `in <code>content/instagram/calendar/${week}.json</code>`}.
You can also edit any slide text or caption there. If a post changes after this email, you'll get a new preview of it
and it waits 3 hours before publishing.</p>
${heldHtml}${warningsHtml}
${sections.join('\n')}
</div>`;

  const ok = await emailService.sendHtml(
    `[Zenlot IG] ${ready < WEEKLY_SLOTS.length ? `⚠️ ${ready} of ${WEEKLY_SLOTS.length} posts ready · ` : ''}Plan for ${week}: ${calendar.theme}`,
    html,
    attachments,
    path.join('out', 'instagram', week, 'preview.html'),
  );
  if (!ok) throw new Error('The plan is saved but its preview email was not sent. Each post will be previewed and held before it publishes; run ig:repreview to send the previews now.');
  if (!env.DRY_RUN) {
    const sentAt = new Date();
    for (const [post, fingerprint] of fingerprints) markPreviewed(post, fingerprint, sentAt);
    saveCalendar(calendar);
  }
  if (plan.missing.length) {
    console.error(`❌ The week is incomplete: ${plan.missing.join('; ')}`);
    process.exitCode = 1; // saved and emailed, but show it in GitHub Actions
  }
  console.log('✅ Planner done');
}

main().catch((err) => {
  console.error('❌ Planner failed:', err);
  process.exit(1);
});
