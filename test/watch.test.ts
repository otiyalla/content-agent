import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'fs';
import { CRONS, WATCH_HOUR, run, type Env } from '../cron-trigger/src/index';
import { nextPublishRun } from '../src/instagram/approval';
import { isoWeekId } from '../src/instagram/calendar';
import { calendarProblems, nextRun, tokenProblem, weekId, weeksToWatch, type WatchedPost } from '../src/instagram/watch';
import { watchProblems, workerProblem } from '../src/workflows/instagram-watch';

const post = (o: Partial<WatchedPost>): WatchedPost => ({ id: 'p', scheduledAt: '2026-11-25T13:00:00.000Z', status: 'scheduled', ...o });
const at = (t: string) => new Date(`2026-11-${t}:00Z`);
const problems = (posts: WatchedPost[], now: Date) => calendarProblems({ '2026-W47': [], '2026-W48': posts, '2026-W49': [] }, now);

test('week ids match the calendar', () => {
  for (let t = Date.UTC(2024, 11, 20); t < Date.UTC(2033, 0, 10); t += 86400_000) assert.equal(weekId(new Date(t)), isoWeekId(new Date(t)));
});
test('a post is overdue only once its retries are over', () => {
  assert.deepEqual(problems([post({})], at('25T17:59')), []);
  assert.match(problems([post({ lastError: 'R2 down' })], at('25T19:37'))[0], /p was due 2026-11-25 13:00 UTC and is not out: R2 down/);
  assert.equal(problems([post({ status: 'failed' })], at('25T19:37')).length, 1);
  for (const status of ['published', 'skipped', 'missed']) assert.deepEqual(problems([post({ status })], at('25T19:37')), [], status);
  assert.match(problems([post({ status: 'missed', missedNotice: 'x' })], at('25T19:37'))[0], /notice email has not been sent/);
  assert.match(problems([post({ scheduledAt: 'soon' })], at('25T19:37'))[0], /can't be read/);
});
test('a long-paused post stops being reported, and a held one says why', () => {
  assert.equal(problems([post({})], at('27T18:59')).length, 1);
  assert.deepEqual(problems([post({})], at('27T19:37')), []);
  assert.match(problems([post({ previewedAt: '2026-11-25T18:07:00.000Z' })], at('25T19:37'))[0], /previewed again at 18:07 UTC, so it waits/);
  assert.doesNotMatch(problems([post({ previewedAt: '2026-11-22T16:00:00.000Z' })], at('25T19:37'))[0], /previewed again/);
});
test('the hold message stops once the hold is over or publishing has failed', () => {
  const early = { previewedAt: '2026-11-25T13:07:00.000Z' }; // could go out at 18:07
  assert.doesNotMatch(problems([post(early)], at('25T19:37'))[0], /previewed again/);
  assert.doesNotMatch(problems([post({ status: 'failed', previewedAt: '2026-11-25T18:07:00.000Z' })], at('25T19:37'))[0], /previewed again/);
  for (let t = Date.UTC(2026, 10, 25); t < Date.UTC(2026, 10, 27); t += 600_000) assert.equal(nextRun(t), nextPublishRun(new Date(t)).getTime());
});
test('a badly edited calendar is reported, and never hides other warnings', async () => {
  const bad = [null, { id: 'n' }, post({ scheduledAt: 5 as unknown as string, previewedAt: 5 as unknown as string }), post({ previewedAt: {} as unknown as string })] as unknown as WatchedPost[];
  const found = problems(bad, at('25T19:37'));
  assert.equal(found.filter((f) => f.includes("isn't a post")).length, 2);
  assert.ok(found.some((f) => f.includes("can't be read")) && found.some((f) => f.includes('is not out')));
  const r = await worker(COMMENTS, '25T19:37', (u) => (u.includes('dispatches') ? new Response('', { status: 401 }) : Response.json({ posts: bad })));
  assert.match(r.sent[0], /could not start a job[\s\S]*isn't a post/);
});
test('while the owner is away only a stopped Worker is reported', async () => {
  const keep = { GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  const real = globalThis.fetch;
  Object.assign(process.env, { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' });
  try {
    globalThis.fetch = (async () => Response.json({ workflow_runs: [] })) as typeof fetch;
    const found = await watchProblems(new Date('2040-01-04T20:00:00Z'), true);
    assert.ok(found.length === 1 && found[0].includes('Worker has started no job'));
    globalThis.fetch = (async () => Response.json({ workflow_runs: [{ created_at: '2040-01-04T19:37:00Z' }] })) as typeof fetch;
    assert.deepEqual(await watchProblems(new Date('2040-01-04T20:00:00Z'), true), []);
  } finally {
    globalThis.fetch = real;
    for (const [k, v] of Object.entries(keep)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
test('no calendar at all is not called a missing plan', () => {
  assert.match(calendarProblems({ '2026-W47': null, '2026-W48': null }, at('25T19:37')).join(), /^No calendar could be found[^,]*, not even/);
});
test('the daily check stays on the schedule, and the crons match wrangler.toml', () => {
  const toml = fs.readFileSync('cron-trigger/wrangler.toml', 'utf8');
  for (const cron of Object.keys(CRONS)) assert.ok(toml.includes(`"${cron}"`), cron);
  const hours = Object.entries(CRONS).find(([, job]) => job === 'comments')![0].split(' ')[1].split(',');
  assert.ok(hours.some((h) => { const [a, b = a] = h.split('-').map(Number); return a <= WATCH_HOUR && WATCH_HOUR <= b; }));
});
test('a failed alert email is an error, and requests time out', async () => {
  const broken = { EMAIL: { send: async () => { throw new Error('not verified'); } } };
  const overdue = (url: string) => (url.includes('dispatches') ? new Response(null, { status: 204 }) : Response.json({ posts: [post({})] }));
  assert.match((await worker(COMMENTS, '25T19:37', overdue, broken)).error, /alert email failed: not verified/);
  assert.match((await worker(PUBLISH, '25T13:07', () => new Response('', { status: 401 }), broken)).error, /not verified \(after: dispatch publish failed: 401/);
  const real = globalThis.fetch;
  const signals: unknown[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => { signals.push(init?.signal); return ok(String(url)); }) as typeof fetch;
  try {
    await run({ cron: COMMENTS, scheduledTime: at('25T19:37').getTime() }, { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', WORKFLOW_FILE: 'w.yml' }, 0);
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(signals.length === 3 && signals.every((s) => s instanceof AbortSignal));
});
test('the watchdog says when IG_LIVE is off', async () => {
  const keep = { ...process.env };
  Object.assign(process.env, { GITHUB_ACTIONS: 'true', IG_LIVE: '', GITHUB_REPOSITORY: '', GITHUB_TOKEN: '' });
  try {
    assert.match((await watchProblems(new Date('2040-01-04T20:00:00Z')))[0], /IG_LIVE is not "true"/);
    process.env.IG_LIVE = 'true';
    assert.doesNotMatch((await watchProblems(new Date('2040-01-04T20:00:00Z')))[0], /IG_LIVE/);
  } finally {
    process.env = keep;
  }
});
test('a missing plan is noticed from Sunday evening', () => {
  assert.deepEqual(weeksToWatch(at('29T15:00')), ['2026-W47', '2026-W48']);
  const weeks = { '2026-W47': null, '2026-W48': [], '2026-W49': null };
  assert.deepEqual(calendarProblems(weeks, at('29T18:00')), []);
  assert.match(calendarProblems(weeks, at('29T19:37'))[0], /no plan for 2026-W49/);
  assert.match(calendarProblems({ '2026-W48': 'unknown', '2026-W49': null }, at('30T03:00')).join(), /W48 could not be read.*no plan for 2026-W49/);
});
test('the token warning counts down', () => {
  const w = (h: string | null) => tokenProblem(h, at('25T19:37'));
  assert.match(w('2026-12-09 20:00:00 UTC')!, /14 days left/);
  assert.match(w('2026-11-26 10:00:00 -0500')!, /within a day/);
  for (const h of [null, 'never', '2026-12-04 20:00:00 UTC', '2027-12-09 20:00:00 UTC']) assert.equal(w(h), null);
});

const worker = async (cron: string, time: string, reply: (url: string) => Response | Error, setup: Partial<Env> = {}) => {
  const real = globalThis.fetch;
  const sent: string[] = [];
  let calls = 0;
  globalThis.fetch = (async (url: unknown) => {
    calls++;
    const r = reply(String(url));
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  let error = '';
  try {
    const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', WORKFLOW_FILE: 'w.yml', ALERT_TO: 'a@x', ALERT_FROM: 'b@x', EMAIL: { send: async (m: { text: string }) => void sent.push(m.text) }, ...setup };
    await run({ cron, scheduledTime: at(time).getTime() }, env as Env, 0);
  } catch (err) {
    error = (err as Error).message;
  } finally {
    globalThis.fetch = real;
  }
  return { sent, calls, error };
};
const ok = (url: string) => (url.includes('dispatches') ? new Response(null, { status: 204 }) : Response.json({ posts: [] }));
const PUBLISH = '7 13,14,18 * * *';
const COMMENTS = '37 13-16,19,22 * * *';
test('the Worker emails when a job cannot start', async () => {
  assert.deepEqual(await worker(PUBLISH, '25T13:07', ok), { sent: [], calls: 1, error: '' });
  const expired = await worker(PUBLISH, '25T13:07', () => new Response('Bad credentials', { status: 401 }));
  assert.equal(expired.calls, 1);
  assert.match(expired.sent[0], /could not start a job.*401 Bad credentials/);
  assert.match(expired.error, /401/);
  const down = await worker(PUBLISH, '25T13:07', () => new Error('offline'));
  assert.deepEqual([down.calls, down.sent.length], [3, 1]);
  assert.equal((await worker(COMMENTS, '25T13:37', () => new Response('', { status: 401 }))).sent.length, 0);
  let n = 0;
  assert.deepEqual(await worker(PUBLISH, '25T13:07', () => new Response(null, { status: ++n < 2 ? 502 : 204 })), { sent: [], calls: 2, error: '' });
});
test('the Worker checks the calendar once a day, even when dispatch fails', async () => {
  assert.equal((await worker(COMMENTS, '25T19:37', ok)).sent.length, 0);
  const overdue = (url: string) => (url.includes('dispatches') ? new Response('', { status: 401 }) : Response.json({ posts: [post({})] }));
  const r = await worker(COMMENTS, '25T19:37', overdue);
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0], /could not start a job[\s\S]*p was due/);
  assert.equal((await worker(COMMENTS, '25T16:37', (u) => (u.includes('dispatches') ? new Response(null, { status: 204 }) : Response.json({ posts: [post({})] })))).sent.length, 0);
  assert.equal((await worker(COMMENTS, '25T19:37', overdue, { ALERT_TO: undefined })).sent.length, 0);
});
test('the watchdog notices a silent Worker', async () => {
  const real = globalThis.fetch;
  const check = async (body: unknown, status = 200) => {
    globalThis.fetch = (async () => Response.json(body, { status })) as typeof fetch;
    try {
      return await workerProblem(at('25T20:00'), 'o/r', 't');
    } finally {
      globalThis.fetch = real;
    }
  };
  assert.equal(await check({ workflow_runs: [{ created_at: '2026-11-25T18:07:00Z' }] }), null);
  assert.match((await check({ workflow_runs: [{ created_at: '2026-11-24T13:07:00Z' }] }))!, /started no job since 2026-11-24/);
  assert.match((await check({ workflow_runs: [] }))!, /records began/);
  assert.match((await check({}, 403))!, /403/);
  assert.equal(await workerProblem(at('25T20:00'), '', ''), null);
});
