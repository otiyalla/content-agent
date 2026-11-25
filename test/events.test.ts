import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventIssues, eventNotes, eventsRunOut, weekEvents } from '../src/instagram/events';
import { buildPrompt, checkPlan } from '../src/instagram/strategist';
import { WEEKLY_SLOTS } from '../src/instagram/calendar';
import type { WeekPlan } from '../src/instagram/types';

const W49 = new Date('2026-11-30T00:00:00Z');
const W50 = new Date('2026-12-07T00:00:00Z');
const QUIET = new Date('2026-12-21T00:00:00Z');
const prompt = (weekStart: Date) => buildPrompt({ weekLabel: 'x', slots: WEEKLY_SLOTS, recentPosts: [], weekStart });

test('each week gets its own events, with the right weekday', () => {
  assert.deepEqual(weekEvents(W49).map((e) => e.name), ['US jobs report (NFP)']);
  assert.match(prompt(W49), /# Market events this week[\s\S]*US jobs report \(NFP\): Friday,? 4 December/);
  assert.match(eventNotes(W50), /Fed rate decision: Wednesday,? 9 December/);
  assert.equal(eventNotes(QUIET), '');
  assert.doesNotMatch(prompt(QUIET), /Market events/);
  for (let m = W49.getTime(); m < Date.UTC(2027, 11, 6); m += 7 * 86400_000) {
    for (const e of weekEvents(new Date(m))) assert.equal(e.date.getUTCDay(), e.name.startsWith('Fed') ? 3 : 5, e.date.toISOString());
  }
});
test('wrong dates and market views are blocked; risk notes pass', () => {
  for (const t of ['The US jobs report is on Friday 4 December. Decide your rule now.', 'NFP: Dec 4. Spreads can widen.', 'Fed decision on 9 December: smaller size or stand aside?', 'I journal on 5 December.', 'Before the Fed, write 2 decisions down.', 'The Fed decision, Wednesday 9 Dec', 'Cut risk before the jobs report.']) {
    assert.deepEqual(eventIssues(t), { block: [], warn: [] }, t);
  }
  for (const t of ['Jobs report, Friday 5 December', 'NFP on Dec 11th', 'The Fed meets 4 December', 'A bullish jobs report is coming', 'The Fed will cut rates', 'After NFP the dollar will rally']) {
    assert.ok(eventIssues(t).block.length, t);
  }
  assert.equal(eventIssues('Consensus for the jobs report is 150k').warn.length, 1);
  assert.equal(eventIssues('The jobs report is tomorrow').warn.length, 1);
});
test('the plan email says when dates run out', () => {
  assert.deepEqual(eventsRunOut(W49), []);
  assert.equal(eventsRunOut(new Date('2027-11-01T00:00:00Z')).length, 1);
});
test('a post with a wrong event date is held, and the rest of the week is not', async () => {
  const post = (slot: number, caption: string) => ({
    slot, pillar: WEEKLY_SLOTS[slot].pillars[0], topic: 't', rationale: 'r', caption: `${caption}\n\nEducational content, not financial advice.`, hashtags: [], altText: 'alt', hookType: 'question', ctaType: 'save', series: '',
    slides: [{ layout: 'cover', kicker: 'k', title: 'Check the calendar first', body: 'Know the date.', stat: '', items: [], screen: '', theme: 'dark' }],
  });
  const plan = { theme: 'x', posts: [post(1, 'Jobs report: 5 December.'), post(3, 'Jobs report: 4 December.')] } as unknown as WeekPlan;
  const { posts } = await checkPlan(plan, WEEKLY_SLOTS);
  assert.ok(posts[0].held.some((h) => h.includes('5 December')));
  assert.ok(!posts[1].held.some((h) => h.includes('December')));
});
