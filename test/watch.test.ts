import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, type Env } from '../cron-trigger/src/index';
import { isoWeekId } from '../src/instagram/calendar';
import { calendarProblems, tokenProblem, weekId, weeksToWatch, type WatchedPost } from '../src/instagram/watch';
import { workerProblem } from '../src/workflows/instagram-watch';

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
