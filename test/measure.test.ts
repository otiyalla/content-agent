import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performanceSummary } from '../src/instagram/strategist';
import { keepLinkTaps, unsplitWarning } from '../src/instagram/insights';
import type { CalendarPost, PostInsights } from '../src/instagram/types';

const post = (n: number, at7d?: Partial<PostInsights>, at48h?: Partial<PostInsights>): CalendarPost =>
  ({
    id: `2026-W48-p${n}`,
    status: 'published',
    pillar: 'risk',
    hookType: n % 2 ? 'stat' : 'myth',
    ctaType: 'save',
    slides: [{ layout: 'cover', title: `Post ${n}` }],
    published: { publishedAt: '2026-11-01T13:00:00.000Z' },
    insightSnapshots: {
      ...(at7d ? { '7d': { fetchedAt: 'x', ...at7d } } : {}),
      ...(at48h ? { '48h': { fetchedAt: 'x', ...at48h } } : {}),
    },
  }) as unknown as CalendarPost;
const many = (k: number, f: (n: number) => Partial<PostInsights>) => Array.from({ length: k }, (_, n) => post(n, f(n)));

test('ten posts with tiny reach do not open the gate', () => {
  const s = performanceSummary(many(10, (n) => ({ reach: 3, follows: n === 0 ? 1 : 0 })));
  assert.match(s, /^NOT ENOUGH DATA YET/);
  assert.match(s, /0 measured at 7 days/);
  assert.match(s, /10 left out for reaching fewer than 30 accounts/);
  assert.doesNotMatch(s, /333/);
});
test('enough posts but too few people keeps the gate shut', () => {
  const s = performanceSummary(many(10, () => ({ reach: 50, follows: 2 })));
  assert.match(s, /^NOT ENOUGH DATA YET/);
  assert.match(s, /reaching 500 accounts/);
  assert.match(s, /needs a combined reach of 1,000/);
  assert.doesNotMatch(s, /needs 10 posts/);
});
test('too few posts keeps the gate shut even with big reach', () => {
  const s = performanceSummary(many(9, () => ({ reach: 5000, follows: 20 })));
  assert.match(s, /needs 10 posts measured at 7 days, counting only/);
});
test('ranking uses the 7-day snapshot, not 48 hours', () => {
  const posts = many(10, (n) => ({ reach: 200, follows: n, saved: 0 }));
  posts.push(post(99, undefined, { reach: 5000, follows: 500 }));
  const s = performanceSummary(posts);
  assert.doesNotMatch(s, /NOT ENOUGH/);
  assert.match(s, /1 with no 7-day numbers/);
  assert.match(s, /ranked by follows per 1,000 reach/);
  assert.match(s, /Best performers:\n- .*"Post 9" — at 7 days: reach 200, follows 9 \(45\.0 per 1k reach\)/);
  assert.doesNotMatch(s, /Post 99/);
});
test('few follows: ranked on engagement, with no follow tables', () => {
  const s = performanceSummary(many(10, (n) => ({ reach: 200, follows: n === 3 ? 1 : 0, saved: n })));
  assert.match(s, /Fewer than 10 follows so far/);
  assert.match(s, /Best performers:\n- .*"Post 9"/);
  assert.doesNotMatch(s, /by hook/);
});
test('tag rates are pooled, so one small post cannot dominate', () => {
  const posts = many(10, () => ({ reach: 1000, follows: 2 }));
  posts.push(post(11, { reach: 30, follows: 3 })); // stat: 2*5 + 3 follows over 5,030 reach
  const s = performanceSummary(posts);
  assert.match(s, /by hook: stat 2\.6\/1k \(6 posts\), myth 2\.0\/1k \(5 posts\)/);
});
test('posts that flopped are named, not just counted', () => {
  const posts = many(10, () => ({ reach: 200, follows: 2 }));
  posts.push(post(42, { reach: 12, follows: 0 }));
  const s = performanceSummary(posts);
  assert.doesNotMatch(s, /NOT ENOUGH/);
  assert.match(s, /Reached fewer than 30 accounts at 7 days, so not ranked:\n- .*"Post 42" — reach 12$/);
  assert.match(performanceSummary([post(42, { reach: 12 })]), /so not ranked:\n- .*"Post 42"/);
});
test('a missed snapshot and a missing reach are labelled as such', () => {
  const old = post(1);
  const young = { ...post(2), published: { publishedAt: '2026-11-24T13:00:00.000Z' } } as CalendarPost;
  const s = performanceSummary([old, young, post(3, { follows: 1 })], new Date('2026-11-26T12:00:00Z'));
  assert.match(s, /1 not yet measured \(younger than 7 days\)/);
  assert.match(s, /1 with no 7-day numbers \(published before snapshots existed, or the snapshot was missed\)/);
  assert.match(s, /1 left out because Instagram reported no reach/);
  assert.doesNotMatch(s, /fewer than 30 accounts;|left out for reaching/);
});
test('without enough follows, lines show counts but no rate per 1,000', () => {
  const s = performanceSummary(many(10, (n) => ({ reach: 200, follows: n === 3 ? 1 : 0, saved: n === 3 ? 9 : 0 })));
  assert.match(s, /follows 1, profile/);
  assert.doesNotMatch(s, /per 1k reach\)/);
});

test('item 4: unknown link taps say so, and a blank fetch keeps the earlier count', () => {
  const s = performanceSummary(many(10, (n) => ({ reach: 200, saved: n, ...(n === 9 ? {} : { linkTaps: 0 }) })));
  assert.match(s, /link taps unknown/);
  assert.match(s, /link taps 0/);
  const kept = keepLinkTaps({ fetchedAt: 'b' }, { fetchedAt: 'a', linkTaps: 2 });
  assert.deepEqual([kept.linkTaps, kept.linkTapsFrom], [2, 'a']);
  assert.equal(keepLinkTaps({ fetchedAt: 'c' }, kept).linkTapsFrom, 'a'); // still the original read, not the last carry
  const read = keepLinkTaps({ fetchedAt: 'b', linkTaps: 3 }, { fetchedAt: 'a', linkTaps: 2 });
  assert.deepEqual([read.linkTaps, read.linkTapsFrom], [3, undefined]);
  assert.equal(keepLinkTaps({ fetchedAt: 'b' }, undefined).linkTaps, undefined);
});

test('item 4: a carried count reads as a minimum, and the unsplit warning is said once, at 7 days', () => {
  const s = performanceSummary(many(10, (n) => ({ reach: 200, saved: n, linkTaps: 1, ...(n === 9 ? { linkTapsFrom: 'a' } : {}) })));
  assert.match(s, /link taps at least 1/);
  const unsplit: PostInsights = { fetchedAt: 'b', profileActions: 3 };
  assert.match(unsplitWarning('p1', unsplit, ['7d'])!, /3 profile action\(s\) at 7 days.*link taps are unknown/);
  assert.match(unsplitWarning('p1', { ...unsplit, linkTaps: 1, linkTapsFrom: 'a' }, ['7d'])!, /at least 1 \(read a\)/);
  assert.equal(unsplitWarning('p1', unsplit, ['48h']), undefined); // not before 7 days
  assert.equal(unsplitWarning('p1', unsplit, []), undefined); // nor on later Sunday refreshes
  assert.equal(unsplitWarning('p1', { fetchedAt: 'b', linkTaps: 0 }, ['7d']), undefined);
});
