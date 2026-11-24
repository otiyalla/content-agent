import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listen, markSent, tagKey, type ListenState } from '../src/instagram/listening';
import { instagramService } from '../src/services/social/instagram.service';

const NOW = new Date('2026-11-24T13:37:00Z');
const later = (h: number) => new Date(NOW.getTime() + h * 3600_000);
const ts = (d: Date) => d.toISOString();
const empty = (): ListenState => ({ seen: {} });

/** A fake Instagram with 65 posts, one of them carrying 120 comments, one comment with 60 replies, served in pages of 50. */
function fake(o: { tags?: 'ok' | 'denied'; failPost?: string } = {}) {
  const posts = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, timestamp: ts(new Date(NOW.getTime() - i * 1.385 * 86400_000)), comments_count: i === 40 ? 120 : 0, caption: 'c' }));
  const comments: Record<string, Array<Record<string, unknown>>> = {
    p40: Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, text: 'hello', username: 'u', timestamp: ts(NOW) })),
  };
  const replies = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, text: i === 59 ? 'I lost everything' : 'hi', username: i === 10 ? 'zenlot_app' : 'v', timestamp: ts(later(i / 100)) }));
  const calls: string[] = [];
  const page = (all: unknown[], u: URL, size = 50) => {
    const at = Number(u.searchParams.get('after') ?? 0);
    const next = at + size < all.length;
    return { data: all.slice(at, at + size), paging: { cursors: { after: String(at + size) }, ...(next ? { next: 'https://example.invalid/?access_token=SECRET' } : {}) } };
  };
  globalThis.fetch = (async (input: string) => {
    const u = new URL(input);
    const [, , a, b] = u.pathname.split('/');
    calls.push(`${a}/${b}`);
    const ok = (v: unknown) => new Response(JSON.stringify(v));
    if (b === 'media') return ok(page(posts, u));
    if (b === 'tags') return o.tags === 'denied' ? new Response(JSON.stringify({ error: { message: '(#10) Application does not have permission' } }), { status: 400 }) : ok(page([{ id: 't1', username: 'fan', caption: 'love @zenlot_app', timestamp: ts(NOW) }], u));
    if (b === 'replies') return ok(page(replies, u));
    if (a === o.failPost) return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    const list = (comments[a] ?? []).map((c) => (c.id === 'c7' ? { ...c, replies: { ...page(replies, new URL('https://x/')) } } : c));
    return ok(page(list, u));
  }) as unknown as typeof fetch;
  return { posts, calls };
}

test('T0.3: 65 posts in the window, 120 comments and 60 replies: nothing is lost', async () => {
  const f = fake();
  const heard = await listen(empty(), NOW);
  assert.equal(heard.postsChecked, 65);
  assert.equal(heard.items.filter((i) => !i.threadOf).length, 120);
  assert.equal(heard.items.filter((i) => i.threadOf).length, 59); // 60 less our own
  assert.equal(heard.items.find((i) => i.comment.id === 'r59')?.flag, 'distress');
  assert.equal(heard.items.find((i) => i.comment.id === 'r5')?.answered, true);
  assert.equal(heard.items.find((i) => i.comment.id === 'r20')?.answered, false);
  assert.deepEqual(heard.gaps, []);
  assert.ok(f.calls.length < 80);
});

test('the same comment and tag are sent once; unchanged older posts are skipped until a week passes', async () => {
  fake();
  const state = markSent(await listen(empty(), NOW), NOW);
  assert.ok(state.tags![tagKey('t1')]);
  assert.ok(!JSON.stringify(state).includes('"t1"'));
  const f = fake();
  const again = await listen(state, later(24));
  assert.deepEqual([again.items.length, again.tags.length], [0, 0]);
  assert.ok(!f.calls.includes('p40/comments'));
  const g = fake();
  await listen(state, later(24 * 8));
  assert.ok(g.calls.includes('p40/comments'));
});

test('later runs on the same day read only the latest 10', async () => {
  fake();
  const state = markSent(await listen(empty(), NOW), NOW);
  const f = fake();
  await listen(state, later(1));
  assert.equal(f.calls.filter((c) => c.endsWith('/comments')).length, 10);
});

test('AC-16: missing permission reads "not ready", not "no tags"', async () => {
  fake({ tags: 'denied' });
  const heard = await listen(empty(), NOW);
  assert.deepEqual(heard.gaps, ['tags: not ready, the token lacks permission']);
});

test('one unreadable post is reported, hides nothing else, and the full scan is tried again', async () => {
  fake({ failPost: 'p3' });
  const heard = await listen(empty(), NOW);
  assert.deepEqual(heard.gaps, ['comments on 1 post(s) could not be read']);
  assert.equal(heard.next.fullScanDay, undefined);
  assert.equal(heard.items.length, 179);
});

test('a page cap is reported as incomplete and never cached as read', async () => {
  fake();
  const read = await instagramService.getComments('p40', 1);
  assert.deepEqual([read.items.length, read.complete], [50, false]);
  const heard = await listen(empty(), NOW, { service: {
    listMediaSince: (s: Date) => instagramService.listMediaSince(s),
    getTags: () => instagramService.getTags(),
    getComments: (id: string) => instagramService.getComments(id, 1),
  } });
  assert.deepEqual(heard.gaps, ['1 post(s) have more comments than one run reads']);
  assert.equal(heard.next.posts!.p40, undefined);
});
