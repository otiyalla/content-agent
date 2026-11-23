import path from 'path';
import { env } from '../config/env';
import { emailService } from '../services/email.service';
import { instagramService } from '../services/social/instagram.service';
import {
  WEEKLY_SLOTS,
  isoWeekId,
  loadCalendar,
  nextWeekMonday,
  recentPosts,
  saveCalendar,
  slotTime,
} from '../instagram/calendar';
import { refreshInsights } from '../instagram/insights';
import { followerChange, recordAccountDay } from '../instagram/account';
import { renderPost } from '../instagram/renderer';
import { qaPost } from '../instagram/qa';
import { markPreviewed } from '../instagram/approval';
import { editLink, esc, postSectionHtml, type Attachment } from '../instagram/preview';
import { planWeek } from '../instagram/strategist';
import type { CalendarPost, WeekCalendar } from '../instagram/types';

// ---------------------------------------------------------------------------
// Instagram weekly planner — runs Sunday.
//
//   1. Pull fresh insights for recent posts (the "social media manager" loop)
//   2. Ask the strategist (Claude Opus 5.5) to plan next week, informed by them
//   3. Save the calendar to content/instagram/calendar/<week>.json
//   4. Render every slide and email the team a full preview + last week's report
//
// Posts then auto-publish on schedule unless someone sets "status": "skipped".
//
// Usage:
//   npm run ig:plan                         # plan next week
//   npm run ig:plan -- --week 2026-W48      # plan a specific week
//   npm run ig:plan -- --force              # overwrite an existing plan
//   IG_PLAN_NOTES="NFP is Friday" npm run ig:plan
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
    activity = ` · last 7 days: <b>${a.profileViews ?? '–'}</b> profile views, <b>${a.linkTaps ?? '–'}</b> link-in-bio taps, reach ${a.reach ?? '–'}`;
  } catch (err) {
    console.warn(`Could not fetch account insights: ${err instanceof Error ? err.message : err}`);
  }
  if (f.now === undefined) return `<p style="color:#666">No follower history yet${activity}.</p>`;
  const sign = (f.change ?? 0) > 0 ? '+' : '';
  return `<p style="font-size:15px">Followers: <b>${f.now}</b> (${sign}${f.change} in 7 days)${activity}</p>`;
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
      return `<tr><td>${p.id.split('-').pop()}</td><td>${link}</td><td>${age}</td><td>${i.reach ?? '–'}</td><td><b>${i.follows ?? '–'}</b></td><td>${i.profileVisits ?? '–'}</td><td>${i.linkTaps ?? '–'}</td><td>${i.saved ?? '–'}</td><td>${i.shares ?? '–'}</td><td>${i.likes ?? '–'}</td><td>${i.comments ?? '–'}</td></tr>`;
    })
    .join('');
  return `<p style="color:#667;font-size:12px;margin:0 0 6px">Latest numbers. Posts of different ages aren't comparable; the planner compares them at 48 hours.</p>
<table cellpadding="6" style="border-collapse:collapse;font-size:13px">
<tr style="background:#f2f4f7;text-align:left"><th>Day</th><th>Post</th><th>Age</th><th>Reach</th><th>Follows</th><th>Profile visits</th><th>Link taps</th><th>Saves</th><th>Shares</th><th>Likes</th><th>Comments</th></tr>${rows}</table>`;
}

async function main() {
  const force = process.argv.includes('--force');
  const weekMonday = arg('week') ? mondayFromWeekId(arg('week')!) : nextWeekMonday();
  const week = isoWeekId(weekMonday);
  const weekEnd = new Date(weekMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekLabel = `${week} (${fmtDay(weekMonday)} – ${fmtDay(weekEnd)})`;

  console.log(`📅 Instagram planner — ${weekLabel}${env.DRY_RUN ? ' [DRY RUN]' : ''}`);

  // 1. Performance feedback loop. Always runs, even when next week is already
  //    planned, so the calendar keeps collecting reach/saves/shares every Sunday.
  await refreshInsights(4);

  if (loadCalendar(week) && !force) {
    console.log(`Calendar for ${week} already exists. Use --force to re-plan.`);
    return;
  }
  const history = recentPosts(6);
  const lastWeek = recentPosts(1);

  let account = '';
  if (instagramService.configured) {
    try {
      const a = await instagramService.getAccount();
      account = `@${a.username}: ${a.followers_count ?? '?'} followers, ${a.media_count ?? '?'} posts`;
      console.log(`Account: ${account}`);
    } catch (err) {
      console.warn(`Could not fetch account info: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 2. Plan
  console.log('🧠 Planning the week with the strategist...');
  const plan = await planWeek({ weekLabel, slots: WEEKLY_SLOTS, recentPosts: history, notes: process.env.IG_PLAN_NOTES });

  // 3. Save calendar
  const calendar: WeekCalendar = {
    week,
    theme: plan.theme,
    generatedAt: new Date().toISOString(),
    posts: plan.posts
      .sort((a, b) => a.slot - b.slot)
      .map(({ slot, ...post }) => {
        const s = WEEKLY_SLOTS[slot];
        return { id: `${week}-${s.day}`, scheduledAt: slotTime(weekMonday, s).toISOString(), status: 'scheduled' as const, ...post };
      }),
  };
  // Fingerprint what the email below shows, so the publisher can tell if it changes afterwards.
  for (const post of calendar.posts) markPreviewed(post);
  const file = saveCalendar(calendar);
  console.log(`💾 Saved ${path.relative(process.cwd(), file)} — theme: "${calendar.theme}"`);

  // 4. Render + email preview
  console.log('🎨 Rendering preview...');
  const attachments: Attachment[] = [];
  const sections: string[] = [];
  for (const post of calendar.posts) {
    const images = await renderPost(post.slides);
    const qa = await qaPost(post);
    sections.push(postSectionHtml(post, images, attachments, qa.blocking));
  }

  let growth = '';
  if (instagramService.configured) {
    try {
      await recordAccountDay();
    } catch (err) {
      console.warn(`Could not record followers: ${err instanceof Error ? err.message : err}`);
    }
    growth = await growthHtml(new Date());
  }
  const edit = editLink(week);
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:900px;color:#111">
<h2 style="margin-bottom:4px">Instagram plan for ${esc(weekLabel)}</h2>
<p style="margin-top:0;color:#445">Theme: <b>${esc(calendar.theme)}</b>${account ? ` · ${esc(account)}` : ''}</p>
<p style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:8px;font-size:14px">
These posts publish automatically at the times shown. To stop one, set its <code>"status"</code> to <code>"skipped"</code>
${edit ? `in <a href="${edit}">the calendar file</a>` : `in <code>content/instagram/calendar/${week}.json</code>`}.
You can also edit any slide text or caption there. If a post changes after this email, you'll get a new preview of it
and it waits 3 hours before publishing.</p>
${sections.join('\n')}
<h2 style="margin-top:40px">Last week's performance</h2>
${growth}
${reportHtml(lastWeek)}
</div>`;

  await emailService.sendHtml(
    `[Zenlot IG] Plan for ${week}: ${calendar.theme}`,
    html,
    attachments,
    path.join('out', 'instagram', week, 'preview.html'),
  );
  console.log('✅ Planner done');
}

main().catch((err) => {
  console.error('❌ Planner failed:', err);
  process.exit(1);
});
