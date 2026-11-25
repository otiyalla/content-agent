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

const TRIES = 3;
const WORKER_QUIET_MS = 26 * 3600_000; // it starts jobs every day

/** A warning if nothing has started the workflow by dispatch lately (the Worker's way of starting it). */
export async function workerProblem(now: Date, opts: { repo?: string; token?: string; pauseMs?: number } = {}): Promise<{ problem: string; confirmed: boolean } | null> {
  const { repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, pauseMs = 5000 } = opts;
  if (!repo || !token) return null; // not on GitHub
  const url = `https://api.github.com/repos/${repo}/actions/workflows/instagram.yml/runs?event=workflow_dispatch&per_page=1`;
  let why = '';
  for (let i = 1; i <= TRIES; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const runs = ((await res.json()) as { workflow_runs?: Array<{ created_at: string }> }).workflow_runs;
      if (!Array.isArray(runs)) throw new Error('GitHub sent no list of runs');
      const latest = runs[0]?.created_at;
      if (latest && now.getTime() - Date.parse(latest) < WORKER_QUIET_MS) return null;
      return { problem: `The Cloudflare Worker has started no job since ${latest ?? 'records began'}. Its GitHub token may have expired: cron-trigger/README.md.`, confirmed: true };
    } catch (err) {
      why = err instanceof Error ? err.message : String(err);
      if (i < TRIES) await new Promise((r) => setTimeout(r, pauseMs * i));
    }
  }
  return { problem: `Could not check whether the Worker is starting jobs (${why}).`, confirmed: false };
}

export async function watchProblems(now: Date, away = false, load = loadCalendar): Promise<{ problems: string[]; workerStopped: boolean }> {
  const worker = await workerProblem(now);
  const workerStopped = worker?.confirmed ?? false;
  // While the owner is away nothing is meant to publish, but the comment digest and its safety alerts still need the Worker.
  if (away) return { problems: worker ? [worker.problem] : [], workerStopped };
  const weeks: Record<string, WatchedWeek> = {};
  for (const week of weeksToWatch(now)) {
    try {
      weeks[week] = load(week)?.posts ?? null;
    } catch {
      weeks[week] = 'unknown';
    }
  }
  const found = worker ? [worker.problem] : [];
  try {
    found.unshift(...calendarProblems(weeks, now));
  } catch (err) {
    found.push(`The calendar check itself failed: ${err instanceof Error ? err.message : err}`); // never lose the other warnings
  }
  const paused = found.length > 0 && !!process.env.GITHUB_ACTIONS && process.env.IG_LIVE !== 'true';
  return { problems: paused ? ['IG_LIVE is not "true", so nothing publishes. If that was not on purpose, set it back.', ...found] : found, workerStopped };
}

async function main() {
  const { problems, workerStopped } = await watchProblems(new Date(), env.OWNER_AWAY);
  if (!problems.length) return console.log(env.OWNER_AWAY ? 'Owner away; Worker running.' : 'Nothing overdue, plans in place, Worker running.');
  for (const p of problems) console.error(`⚠️  ${p}`);
  const backup = env.OWNER_AWAY && workerStopped && env.SAFETY_BACKUP_EMAIL ? [env.SAFETY_BACKUP_EMAIL] : [];
  const subject = `[Zenlot IG] ${problems.length === 1 ? 'Something needs a look' : `${problems.length} things need a look`}`;
  const sent = await emailService.sendHtml(subject, `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`, [], undefined, backup);
  // A failed run is the fallback: GitHub shows it, and emails about it if your notifications allow.
  if (!sent && !env.DRY_RUN) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Watch failed:', err);
    process.exit(1);
  });
}
