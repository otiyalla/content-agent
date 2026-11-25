import { calendarProblems, tokenProblem, weeksToWatch, type WatchedPost, type WatchedWeek } from '../../src/instagram/watch';

// ---------------------------------------------------------------------------
// Backup scheduler for the Instagram workflow.
//
// GitHub stopped firing this repo's `schedule:` triggers (no scheduled run since
// 8 Aug 2026), so this Worker starts the same jobs with workflow_dispatch at
// the same UTC times as .github/workflows/instagram.yml. If GitHub's schedule
// comes back, the duplicates are harmless: runs share a concurrency group, the
// publisher only posts what is due and never posts twice, and the planner skips
// a week that already has a calendar (a run that slips into Monday still means that week).
//
// It also warns by email when a job can't be started, and once a day (19:37 UTC)
// when a post is overdue, a plan is missing or the token is about to expire.
//
// Keep CRONS in step with wrangler.toml [triggers] and the workflow's schedule.
// GITHUB_TOKEN: fine-grained token, this repository only, "Actions: read and write".
// ---------------------------------------------------------------------------

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "owner/name"
  WORKFLOW_FILE: string; // "instagram.yml"
  ALERT_FROM?: string;
  ALERT_TO?: string; // secret; without it, problems are only logged
  EMAIL?: { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
}

const CRONS: Record<string, 'publish' | 'comments' | 'plan'> = {
  '7 13,14,18 * * *': 'publish', // slots are 13:00 Mon–Thu, 14:00 Sat; 18:07 retries
  '37 13-16,19,22 * * *': 'comments', // comment digest
  '0 16 * * SUN': 'plan', // plan next week, refresh token, email preview
};
/** Hour (UTC) of the comments run that also does the daily check. */
const WATCH_HOUR = 19;
const TRIES = 3;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a job. Returns when the token expires, as GitHub reports it. */
async function dispatch(env: Env, jobType: string, pauseMs: number): Promise<string | null> {
  for (let i = 1; ; i++) {
    let problem: string;
    let retry = true;
    try {
      const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'zenlot-cron-trigger',
        },
        body: JSON.stringify({ ref: 'main', inputs: { job_type: jobType } }),
      });
      if (res.status === 204) {
        console.log(`dispatched ${jobType}`);
        return res.headers.get('github-authentication-token-expiration');
      }
      problem = `${res.status} ${(await res.text()).slice(0, 300)}`;
      retry = res.status >= 500 || res.status === 429;
    } catch (err) {
      problem = message(err);
    }
    if (!retry || i >= TRIES) throw new Error(`dispatch ${jobType} failed: ${problem}`);
    await wait(pauseMs * i);
  }
}

/** Reads a week's calendar from the public repository. */
async function readWeek(env: Env, week: string): Promise<WatchedWeek> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/content/instagram/calendar/${week}.json`, { headers: { 'User-Agent': 'zenlot-cron-trigger' } });
    if (res.status === 404) return null;
    if (!res.ok) return 'unknown';
    const posts = ((await res.json()) as { posts?: WatchedPost[] }).posts;
    return Array.isArray(posts) ? posts : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function alert(env: Env, problems: string[]): Promise<void> {
  if (!problems.length) return;
  console.error(`ALERT: ${problems.join(' | ')}`);
  if (!env.EMAIL || !env.ALERT_TO || !env.ALERT_FROM) return console.error('No alert email: EMAIL, ALERT_TO and ALERT_FROM are not all set');
  try {
    await env.EMAIL.send({
      to: env.ALERT_TO,
      from: env.ALERT_FROM,
      subject: `[Zenlot IG] ${problems.length === 1 ? 'Something needs a look' : `${problems.length} things need a look`}`,
      text: `${problems.map((p) => `- ${p}`).join('\n')}\n\nRuns: https://github.com/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}\n`,
    });
  } catch (err) {
    console.error(`alert email failed: ${message(err)}`);
  }
}

export async function run(event: { cron: string; scheduledTime: number }, env: Env, pauseMs = 5000): Promise<void> {
  const jobType = CRONS[event.cron];
  const now = new Date(event.scheduledTime);
  const watching = jobType === 'comments' && now.getUTCHours() === WATCH_HOUR;
  const problems: string[] = [];
  let failed: Error | null = null;
  try {
    if (!jobType) throw new Error(`no job for cron "${event.cron}"`);
    const expiry = await dispatch(env, jobType, pauseMs);
    const token = watching ? tokenProblem(expiry, now) : null;
    if (token) problems.push(token);
  } catch (err) {
    failed = err instanceof Error ? err : new Error(String(err));
    // Comments run six times a day: one warning a day is enough. Nothing else waits.
    if (jobType !== 'comments' || watching) problems.push(`The Worker could not start a job. ${failed.message}`);
  }
  if (watching) {
    const weeks: Record<string, WatchedWeek> = {};
    for (const week of weeksToWatch(now)) weeks[week] = await readWeek(env, week);
    problems.push(...calendarProblems(weeks, now));
  }
  await alert(env, problems);
  if (failed) throw failed; // also shows as an error in Cloudflare
}

export default {
  async scheduled(event: { cron: string; scheduledTime: number }, env: Env): Promise<void> {
    await run(event, env);
  },
  // No public endpoint: nothing can be triggered over HTTP.
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  },
};
