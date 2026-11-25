import { calendarProblems, weeksToWatch, type WatchedWeek } from '../instagram/watch';
import { env } from '../config/env';
import { loadCalendar } from '../instagram/calendar';
import { esc } from '../instagram/preview';
import { emailService } from '../services/email.service';

// ---------------------------------------------------------------------------
// Watchdog: emails when a post is overdue, a plan is missing, or the Worker
// that starts the Instagram jobs seems to have stopped. Runs on GitHub's own
// schedule (.github/workflows/instagram-watch.yml), so it works when the Worker
// is down. The Worker checks the same things from outside GitHub. Posts nothing.
// ---------------------------------------------------------------------------

const WORKER_QUIET_MS = 26 * 3600_000; // it starts jobs every day

/** A warning if nothing has started the workflow by dispatch lately (the Worker's way of starting it). */
export async function workerProblem(now: Date, repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN): Promise<string | null> {
  if (!repo || !token) return null; // not on GitHub
  const url = `https://api.github.com/repos/${repo}/actions/workflows/instagram.yml/runs?event=workflow_dispatch&per_page=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return `Could not check whether the Worker is starting jobs (GitHub answered ${res.status}).`;
    const latest = ((await res.json()) as { workflow_runs?: Array<{ created_at: string }> }).workflow_runs?.[0]?.created_at;
    if (latest && now.getTime() - Date.parse(latest) < WORKER_QUIET_MS) return null;
    return `The Cloudflare Worker has started no job since ${latest ?? 'records began'}. Its GitHub token may have expired: cron-trigger/README.md.`;
  } catch (err) {
    return `Could not check whether the Worker is starting jobs (${err instanceof Error ? err.message : err}).`;
  }
}

export async function watchProblems(now: Date): Promise<string[]> {
  const weeks: Record<string, WatchedWeek> = {};
  for (const week of weeksToWatch(now)) {
    try {
      weeks[week] = loadCalendar(week)?.posts ?? null;
    } catch {
      weeks[week] = 'unknown';
    }
  }
  const worker = await workerProblem(now);
  const found = [...calendarProblems(weeks, now), ...(worker ? [worker] : [])];
  const paused = found.length > 0 && !!process.env.GITHUB_ACTIONS && process.env.IG_LIVE !== 'true';
  return paused ? ['IG_LIVE is not "true", so nothing publishes. If that was not on purpose, set it back.', ...found] : found;
}

async function main() {
  const problems = await watchProblems(new Date());
  if (!problems.length) return console.log('Nothing overdue, plans in place, Worker running.');
  for (const p of problems) console.error(`⚠️  ${p}`);
  if (env.OWNER_AWAY) return console.log('OWNER_AWAY is on: not emailing.');
  const subject = `[Zenlot IG] ${problems.length === 1 ? 'Something needs a look' : `${problems.length} things need a look`}`;
  const sent = await emailService.sendHtml(subject, `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`);
  // A failed run is the fallback: GitHub shows it, and emails about it if your notifications allow.
  if (!sent && !env.DRY_RUN) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Watch failed:', err);
    process.exit(1);
  });
}
