import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { test } from 'node:test';

// Runs the real publisher on a temporary calendar, with a local mail server. Nothing in it gets as far as Instagram:
// every due post is too late, undated or can't be drawn, and --now skips the measurements.
const ROOT = path.resolve(__dirname, '..');
const slides = [{ layout: 'nope', kicker: '', title: 't', body: '', stat: '', items: [], screen: '' }];
const post = (id: string, o: object) => ({ id, topic: id, pillar: 'process', slides, caption: 'c', hashtags: [], altText: 'a', scheduledAt: '2026-11-25T13:00:00.000Z', status: 'scheduled', ...o });

function mailServer(subjects: string[]): net.Server {
  return net.createServer((s) => {
    let data = false;
    let buf = '';
    s.on('error', () => {});
    s.write('220 test\r\n');
    s.on('data', (c) => {
      buf += c;
      for (;;) {
        const end = buf.indexOf(data ? '\r\n.\r\n' : '\r\n');
        if (end < 0) return;
        const text = buf.slice(0, end);
        buf = buf.slice(end + (data ? 5 : 2));
        if (data) {
          subjects.push(/^Subject: (.*)$/m.exec(text)?.[1].trim() ?? '');
          data = false;
          s.write('250 ok\r\n');
        } else if (/^EHLO/i.test(text)) s.write('250-test\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(text)) s.write('235 ok\r\n');
        else if (/^DATA/i.test(text)) {
          data = true;
          s.write('354 go\r\n');
        } else if (/^QUIT/i.test(text)) s.end('221 bye\r\n');
        else s.write('250 ok\r\n');
      }
    });
  });
}

test('every kind of missed post is emailed once, and retried if the email fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-'));
  const file = path.join(dir, 'content/instagram/calendar/2026-W48.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const posts = [
    null,
    'stray',
    post('late', { scheduledAt: '2026-11-23T13:00:00.000Z' }),
    post('undated', { scheduledAt: 'soon' }),
    post('third', { status: 'failed', attempts: 2 }),
    post('again', { attempts: 3, lastError: 'old', missedNotice: 'old' }),
    post('future', { scheduledAt: '2026-11-27T13:00:00.000Z' }),
  ];
  fs.writeFileSync(file, JSON.stringify({ week: '2026-W48', theme: 't', generatedAt: '', posts }));
  const read = (id: string) => JSON.parse(fs.readFileSync(file, 'utf8')).posts.find((p: { id?: string } | null) => p?.id === id);
  fs.writeFileSync(path.join(path.dirname(file), '2026-W47.json'), '{"week":"2026-W47","posts":{}}'); // last week's file is broken: this week still runs
  const subjects: string[] = [];
  const server = mailServer(subjects);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const publish = (smtp: object) =>
    new Promise<string>((resolve) => {
      const child = spawn(process.execPath, ['-r', path.join(ROOT, 'node_modules/ts-node/register/transpile-only'), path.join(ROOT, 'src/workflows/instagram-publisher.ts'), '--now', '2026-11-25T18:07:00Z'], {
        cwd: dir,
        env: {
          PATH: process.env.PATH, TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'), DRY_RUN: 'false', ANTHROPIC_API_KEY: 'x', IG_USER_ID: '1', IG_ACCESS_TOKEN: 'EAAx',
          R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x', R2_BUCKET: 'x', R2_PUBLIC_BASE_URL: 'https://x.invalid', EMAIL_FROM: 'a@x.test', EMAIL_TO: 'b@x.test', ...smtp,
        },
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('close', () => resolve(out));
    });
  try {
    const out = await publish({}); // no mail settings: every email fails
    assert.equal(read('late').status, 'missed', out);
    assert.match(read('late').missedNotice, /within 30 hours/);
    assert.match(read('third').missedNotice, /failed 3 times/);
    assert.deepEqual([read('again').status, read('again').attempts, read('again').missedNotice], ['failed', 1, undefined]);

    const smtp = { SMTP_HOST: '127.0.0.1', SMTP_PORT: String((server.address() as net.AddressInfo).port), SMTP_USER: 'u', SMTP_PASS: 'p' };
    const second = await publish(smtp);
    assert.deepEqual(subjects.map((s) => s.split(': ')[1]).sort(), ['late', 'third', 'undated'], second);
    assert.equal(read('late').missedNotice, undefined);
    assert.equal(read('again').status, 'failed');
    assert.equal(read('future').status, 'scheduled');

    subjects.length = 0;
    await publish(smtp); // "again" fails for the third time; nothing else is repeated
    assert.deepEqual(subjects.map((s) => s.split(': ')[1]), ['again']);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
