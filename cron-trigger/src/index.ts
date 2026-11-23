// ---------------------------------------------------------------------------
// Backup scheduler for the Instagram workflow.
//
// GitHub stopped firing this repo's `schedule:` triggers (no scheduled run since
// 8 Aug 2026), so this Worker starts the same jobs with workflow_dispatch at
// the same UTC times as .github/workflows/instagram.yml. If GitHub's schedule
// comes back, the duplicates are harmless: runs share a concurrency group, the
// publisher only posts what is due and never posts twice, and the planner skips
// a week that already has a calendar.
//
// Keep CRONS in step with wrangler.toml [triggers] and the workflow's schedule.
// GITHUB_TOKEN: fine-grained token, this repository only, "Actions: read and write".
// ---------------------------------------------------------------------------

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "owner/name"
  WORKFLOW_FILE: string; // "instagram.yml"
}

const CRONS: Record<string, 'publish' | 'comments' | 'plan'> = {
  '7 13,14,18 * * *': 'publish', // slots are 13:00 Mon–Thu, 14:00 Sat; 18:07 retries
  '37 13-16,19,22 * * *': 'comments', // comment digest
  '0 16 * * SUN': 'plan', // plan next week, refresh token, email preview
};

async function dispatch(env: Env, jobType: string): Promise<void> {
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
  if (res.status !== 204) throw new Error(`dispatch ${jobType} failed: ${res.status} ${await res.text()}`);
  console.log(`dispatched ${jobType}`);
}

export default {
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const jobType = CRONS[event.cron];
    if (!jobType) throw new Error(`no job for cron "${event.cron}"`);
    await dispatch(env, jobType);
  },
  // No public endpoint: nothing can be triggered over HTTP.
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
