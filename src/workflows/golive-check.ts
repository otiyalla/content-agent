import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { instagramService } from '../services/social/instagram.service';
import { storageService } from '../services/storage.service';
import { isoWeekId, loadCalendar } from '../instagram/calendar';
import { qaPost } from '../instagram/qa';
import type { CalendarPost } from '../instagram/types';

// ---------------------------------------------------------------------------
// Go-live check: everything that has to be true before IG_LIVE (or
// AGENTS_LIVE) is switched on. Read-only: it never posts, edits the calendar
// or changes the profile. See docs/GO-LIVE.md for what each line means.
//
//   npm run golive:check
//   npm run golive:check -- --now 2026-11-23T12:00:00Z
//
// Exits 1 if anything FAILs, so it can gate a workflow.
// ---------------------------------------------------------------------------

type Level = 'PASS' | 'WARN' | 'FAIL' | 'TODO' | 'INFO';
const results: Array<{ level: Level; area: string; text: string }> = [];
const add = (level: Level, area: string, text: string) => results.push({ level, area, text });

const MAX_LATENESS_MS = 30 * 3600_000; // keep in step with instagram-publisher.ts
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Manual confirmations recorded by a person in content/go-live.json. */
interface Confirmations {
  backupApprover?: string;
  accountStatusCheckedAt?: string;
  installBaselineAt?: string;
  commentsOwner?: string;
}

function loadConfirmations(): Confirmations {
  const file = path.join(process.cwd(), 'content', 'go-live.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Confirmations;
  } catch {
    add('FAIL', 'Checklist', 'content/go-live.json is not valid JSON');
    return {};
  }
}

function checkCode() {
  const ref = process.env.GITHUB_REF_NAME ?? execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  if (ref !== 'main') {
    add('FAIL', 'Code', `Running from "${ref}". Scheduled runs use main, so go live only once this check passes on main.`);
  } else {
    add('PASS', 'Code', 'Running from main, the branch the schedules use');
  }
  if (!process.env.GITHUB_ACTIONS) {
    try {
      execSync('git fetch -q origin main', { stdio: 'ignore' });
      execSync('git cat-file -e origin/main:src/instagram/qa.ts', { stdio: 'ignore' });
      add('PASS', 'Code', 'main has the slide QA gate and approval outbox');
    } catch {
      add('FAIL', 'Code', 'main does not have the QA gate yet (src/instagram/qa.ts missing on origin/main). Merge PR #3 first.');
    }
  }
}

/** Posts that would publish or be marked missed in the next 8 days. */
function relevantPosts(now: Date): Array<{ week: string; post: CalendarPost; posts: CalendarPost[] }> {
  const weeks = [...new Set([-7, 0, 7].map((d) => isoWeekId(new Date(now.getTime() + d * 86400_000))))];
  const out: Array<{ week: string; post: CalendarPost; posts: CalendarPost[] }> = [];
  for (const week of weeks) {
    const cal = loadCalendar(week);
    if (!cal) continue;
    for (const post of cal.posts) {
      if (post.status !== 'scheduled' && post.status !== 'failed') continue;
      if (Date.parse(post.scheduledAt) - now.getTime() > 8 * 86400_000) continue;
      out.push({ week, post, posts: cal.posts });
    }
  }
  return out;
}

async function checkCalendar(now: Date) {
  const posts = relevantPosts(now);
  if (posts.length === 0) {
    add('WARN', 'Calendar', 'No scheduled posts in the next 8 days. Run the planner first.');
    return;
  }

  const willMiss = new Set<string>();
  for (const { post } of posts) {
    const late = now.getTime() - Date.parse(post.scheduledAt);
    if (late > MAX_LATENESS_MS) willMiss.add(post.id);
  }
  if (willMiss.size) {
    add('WARN', 'Calendar', `${[...willMiss].join(', ')} ${willMiss.size === 1 ? 'is' : 'are'} past due and will be marked missed on the first live run.`);
  }

  let blocked = 0;
  for (const { post } of posts) {
    if (willMiss.has(post.id)) continue;
    const qa = await qaPost(JSON.parse(JSON.stringify(post)));
    if (qa.blocking.length) {
      blocked++;
      add('FAIL', 'Calendar', `${post.id} won't publish: ${qa.blocking.join('; ')}`);
    }
  }
  const upcoming = posts.length - willMiss.size;
  if (!blocked && upcoming) add('PASS', 'Calendar', `${upcoming} upcoming post(s) pass slide QA`);

  // Captions that lean on another day's post ("as Monday's maths showed") break if that post never ran.
  for (const { post, posts: weekPosts } of posts) {
    if (willMiss.has(post.id)) continue;
    const text = `${post.caption}\n${post.slides.map((s) => `${s.title} ${s.body}`).join('\n')}`;
    for (const m of text.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)['’]s\b/gi)) {
      const day = DAY_IDS[DAY_NAMES.indexOf(m[1].toLowerCase())];
      const ref = weekPosts.find((p) => p.id.endsWith(`-${day}`));
      if (!ref || ref.id === post.id) continue;
      const ran = ref.status === 'published';
      const willRun = !willMiss.has(ref.id) && (ref.status === 'scheduled' || ref.status === 'failed') && Date.parse(ref.scheduledAt) < Date.parse(post.scheduledAt);
      if (!ran && !willRun) {
        add('WARN', 'Calendar', `${post.id} says "${m[0]}" but ${ref.id} is ${willMiss.has(ref.id) ? 'going to be missed' : ref.status}. Reword the caption.`);
      }
    }
  }
}

async function checkInstagram(c: Confirmations) {
  if (!instagramService.configured) {
    add('FAIL', 'Instagram', 'IG_USER_ID / IG_ACCESS_TOKEN not set');
    return;
  }
  try {
    const limit = await instagramService.getPublishingLimit();
    add('PASS', 'Instagram', `Token works and publishing is allowed (${limit.quota_usage ?? 0}/${limit.config?.quota_total ?? '?'} API posts in the last 24h)`);
  } catch (err) {
    add('FAIL', 'Instagram', `Publishing check failed: ${err instanceof Error ? err.message : err}`);
    return;
  }

  try {
    const p = await instagramService.getProfile();
    add('INFO', 'Instagram', `@${p.username}: ${p.followers_count ?? '?'} followers, ${p.media_count ?? '?'} posts`);
    if (!p.website) {
      add('FAIL', 'Profile', 'No link in bio, but posts tell people "link in bio"');
    } else if (!/[?&](utm_|ct=|pt=|referrer=)/.test(p.website)) {
      add('WARN', 'Profile', `Link in bio (${p.website}) has no tracking tags, so installs from Instagram can't be counted (item 3)`);
    } else {
      add('PASS', 'Profile', `Link in bio is tracked: ${p.website}`);
    }
    if (/never\s+(?:dm|message)/i.test(p.biography ?? '')) add('PASS', 'Profile', 'Bio warns that Zenlot never DMs for money');
    else add('WARN', 'Profile', 'Bio has no "We never DM you for money" line to protect followers from copycat accounts (item 3)');
  } catch (err) {
    add('WARN', 'Profile', `Couldn't read the profile: ${err instanceof Error ? err.message : err}`);
  }

  if (c.accountStatusCheckedAt) add('PASS', 'Instagram', `Account status / recommendation eligibility checked ${c.accountStatusCheckedAt}`);
  else add('TODO', 'Instagram', 'In the Instagram app: Settings > Account status. Confirm nothing is restricted and posts can be recommended, then set accountStatusCheckedAt in content/go-live.json');
}

async function checkInsights(now: Date) {
  const stale: string[] = [];
  for (const week of [isoWeekId(new Date(now.getTime() - 7 * 86400_000)), isoWeekId(now)]) {
    for (const post of loadCalendar(week)?.posts ?? []) {
      if (post.status !== 'published' || !post.published || !post.insights) continue;
      const age = now.getTime() - Date.parse(post.published.publishedAt);
      if (age > 48 * 3600_000 && (post.insights.reach ?? 0) === 0) stale.push(post.id);
    }
  }
  if (stale.length) add('WARN', 'Insights', `${stale.join(', ')} show 0 reach in the calendar. Refresh insights before the planner learns from them (item 15).`);
}

function checkPipes(c: Confirmations) {
  if (storageService.configured) add('PASS', 'Images', 'R2 image hosting configured');
  else add('FAIL', 'Images', 'R2 not configured; Instagram needs public image URLs');

  if (env.SMTP_USER && env.SMTP_PASS) add('PASS', 'Email', `Preview and approval emails go to ${env.EMAIL_TO}`);
  else add('FAIL', 'Email', 'SMTP not configured, so nobody would see previews, change notices or X/Reddit drafts');

  const recipients = env.EMAIL_TO.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (c.backupApprover || recipients.length > 1) add('PASS', 'Approval', `Backup approver: ${c.backupApprover || recipients.slice(1).join(', ')}`);
  else add('TODO', 'Approval', 'Only one person gets the previews. Name a backup approver (backupApprover in content/go-live.json, or add them to EMAIL_TO)');

  if (c.commentsOwner) add('PASS', 'Comments', `Comments are answered by ${c.commentsOwner}`);
  else add('TODO', 'Comments', 'Nobody is assigned to answer comments in the first hours after each post (item 7). Set commentsOwner in content/go-live.json');

  if (c.installBaselineAt) add('PASS', 'Baseline', `Install baseline exported ${c.installBaselineAt}`);
  else add('TODO', 'Baseline', 'Export the last 4 weeks of installs by source from App Store Connect and Play Console, then set installBaselineAt in content/go-live.json');
}

function report(): number {
  const order: Level[] = ['FAIL', 'TODO', 'WARN', 'PASS', 'INFO'];
  const icon: Record<Level, string> = { FAIL: '❌', TODO: '☐', WARN: '⚠️', PASS: '✅', INFO: 'ℹ️' };
  const sorted = [...results].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const lines = sorted.map((r) => `${icon[r.level]} ${r.level.padEnd(4)} ${r.area.padEnd(9)} ${r.text}`);
  const fails = results.filter((r) => r.level === 'FAIL').length;
  const todos = results.filter((r) => r.level === 'TODO').length;
  const verdict = fails
    ? `NOT READY: ${fails} blocking issue(s), ${todos} manual step(s) left`
    : todos
      ? `ALMOST: no blockers, ${todos} manual step(s) left`
      : 'READY to set IG_LIVE=true';
  console.log(`\n${lines.join('\n')}\n\n${verdict}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`## Go-live check: ${verdict}`, '', '| | Area | Detail |', '|---|---|---|', ...sorted.map((r) => `| ${icon[r.level]} | ${r.area} | ${r.text.replace(/\|/g, '\\|')} |`)];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`);
  }
  return fails ? 1 : 0;
}

async function main() {
  const nowArg = process.argv.indexOf('--now');
  const now = nowArg >= 0 ? new Date(process.argv[nowArg + 1]) : new Date();
  console.log(`🚦 Go-live check — ${now.toISOString()} (Instagram is ${env.DRY_RUN ? 'in dry-run mode' : 'LIVE'})`);

  const c = loadConfirmations();
  checkCode();
  await checkCalendar(now);
  await checkInstagram(c);
  await checkInsights(now);
  checkPipes(c);
  process.exitCode = report();
}

main().catch((err) => {
  console.error('❌ Go-live check crashed:', err);
  process.exit(1);
});
