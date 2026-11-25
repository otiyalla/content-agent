import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventIssues, eventNotes, eventsRunOut, lateForEvent, weekEvents } from '../src/instagram/events';
import { qaPost } from '../src/instagram/qa';
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
  assert.match(eventNotes(W50, WEEKLY_SLOTS), /Fed rate decision: Wednesday,? 9 December/);
  assert.equal(eventNotes(QUIET, WEEKLY_SLOTS), '');
  assert.doesNotMatch(prompt(QUIET), /Market events/);
  for (let m = W49.getTime(); m < Date.UTC(2027, 11, 6); m += 7 * 86400_000) {
    for (const e of weekEvents(new Date(m))) assert.equal(e.date.getUTCDay(), e.name.startsWith('Fed') ? 3 : 5, e.date.toISOString());
  }
});
const one = (t: string, monday?: Date) => eventIssues([t], monday);
test('risk notes and correct dates pass', () => {
  for (const t of [
    'The US jobs report is on Friday 4 December. Decide your rule now.', 'NFP: Dec 4. Spreads can widen.', 'Jobs report, Fri, 4 Dec 2026', 'NFP on December 4th (Friday)', 'I journal on 5 December.',
    'Before the Fed, write 2 decisions down.', 'Cut risk before the jobs report.', 'You should cut risk before NFP. Size falls, so does the damage.', 'Decide today what you will do on jobs report day', 'Set your expectations for the jobs report: wider spreads',
    'Converting USD to CAD on NFP day? Check your pip value.', 'Whatever the Fed does, rate cut or hike, keep your size', 'Rate cut or hike, the Fed is not your edge', 'If EURUSD falls through your stop on NFP, the fill can be worse.', 'A fed-up trader rests on 12 December', 'ECB rate decision: 17 December',
    'Dollar risk drops when size drops. Do that before the jobs report.', 'Around the jobs report, spreads can widen and a stop can fill worse than its level.', 'You may 2x your caution before NFP', 'Before the jobs report, risk 1/2 of your usual',
  ]) assert.deepEqual(one(t, W49), { block: [], warn: [] }, t);
  for (const t of ['Fed decision on 9 December: smaller size or stand aside?', 'The Fed decision, Wednesday 9 Dec', 'Fed meeting, December 8-9', 'The Fed meets 8-9 December', 'The Fed meeting starts on Tuesday 8 December', 'The Fed meets Tuesday 8 to 9 December']) assert.deepEqual(one(t, W50), { block: [], warn: [] }, t);
});
test('a date about something else is not the event date', () => {
  for (const t of ['Before NFP on 4 December, review your 3 December trades.', 'Review your 3 December trades before NFP', 'Before NFP on 4 December, finish the plan by 2 December', 'Finish the plan by 2 December, before NFP on 4 December']) assert.deepEqual(one(t, W49), { block: [], warn: [] }, t);
  for (const t of ['NFP on 4 December, or 5 December', 'Jobs report 4 December, NFP day 5 December', 'NFP is 4 December, it lands 5 December', 'Review the plan on 3 December, NFP day']) assert.ok(one(t, W49).block.length, t);
  assert.ok(one('The Fed meeting starts on 8 December, decision on 10 December', W50).block.length);
});
test('an outlook in the next sentence counts', () => {
  for (const t of ['Fed decision: 9 December. A rate cut is coming.', 'Dovish times ahead! Fed decision: 9 December.']) assert.ok(one(t, W50).block.length, t);
  for (const t of ['Fed decision: 9 December. Rate cut or hike, keep your size.', "Fed decision: 9 December. Don't bet on a rate cut.", 'Fed decision: 9 December. Whether a rate cut comes or not, keep your size.', 'Fed decision: 9 December. Rate cut? Rate hike? Same rule.']) assert.deepEqual(one(t, W50), { block: [], warn: [] }, t);
});
test('with two events, a date goes with its own clause', () => {
  for (const t of ['US jobs report is scheduled for Friday 4 December, Fed decision on 9 December.', 'On 4 December, the jobs report, and on 9 December, the Fed decision', 'Jobs report, 4 December; Fed decision, 9 December', 'The jobs report is on 4 December and the Fed decision is on 9 December', '4 December brings NFP before the Fed on 9 December', 'The Fed decides on 9 December after the jobs report on 4 December']) assert.deepEqual(one(t), { block: [], warn: [] }, t);
  for (const t of ['US jobs report is scheduled for 9 December, Fed decision on 4 December.', 'Jobs report, 9 December; Fed decision, 4 December']) assert.ok(one(t).block.length, t);
});
test('a hedge covers only its own claim', () => {
  for (const t of ['The dollar will rise, so check if your size is right', 'The dollar will rise no matter what', 'Check if your size is right because the dollar will rise', 'A rate cut is coming, so cut size and raise cash', 'The dollar will rise, whatever happens']) assert.ok(one(`Fed decision: 9 December. ${t}.`, W50).block.length, t);
  for (const t of ['If the dollar falls through your stop, the fill can be worse', 'Suppose gold falls 50 pips', 'For example, gold falls and your stop slips', 'Illustrative: the dollar falls 50 pips', 'Your stop can slip if gold falls', 'Cut, hold or hike, keep your size']) assert.deepEqual(one(`Fed decision: 9 December. ${t}.`, W50), { block: [], warn: [] }, t);
});
test('the decision has one day, the meeting two', () => {
  for (const t of ['Fed rate decision: Tuesday 8 December 2026', 'The Fed decides on 8 December', '8 December: Fed decision', "The Fed meeting's decision is 8 December"]) assert.ok(one(t, W50).block.length, t);
  for (const t of ['The Fed meeting starts on 8 December, rate decision on 9 December', 'Fed rate decision, 8-9 December', 'Make your own decision before the Fed meets on 8 December']) assert.deepEqual(one(t, W50), { block: [], warn: [] }, t);
});
test('a lowercase may is only the verb where it reads as one', () => {
  const may = new Date('2027-05-03T00:00:00Z');
  for (const t of ['NFP on 6 may 2027', 'NFP: 6 may.', 'NFP is 6 may so plan', '6 may jobs report', 'NFP on may 6', 'NFP may 6', 'NFP on the 6th of may']) assert.ok(one(t, may).block.length, t);
  for (const t of ['NFP on 7 may 2027', 'Of 10 stops on NFP day, only 6 may survive', 'You may 2 times out of 3 skip NFP']) assert.deepEqual(one(t, may), { block: [], warn: [] }, t);
});
test('discouraging a prediction is not a market view', () => {
  for (const t of ["NFP: 4 December. Don't bet that the dollar will rise.", 'Never try to predict a rate cut from the Fed', "Don’t assume the dollar will rally on NFP."]) assert.deepEqual(one(t, W49), { block: [], warn: [] }, t);
  for (const t of ["Don't miss NFP: the dollar will rally", "Don't bet against NFP because the dollar will rise", "Don't guess, the dollar will rise after NFP", "NFP: don't bet against it, gold falls", "Don't expect the dollar to fall after NFP", 'The Fed will never hike: never a rate hike']) assert.ok(one(t, W49).block.length, t);
});
test('wrong dates, weekdays and market views are blocked', () => {
  for (const t of [
    'Jobs report, Friday 5 December', 'NFP on Dec 11th', 'NFP on 8 January', 'Jobs report: Thursday 4 December', 'Jobs report 4 December (Thursday)', 'NFP, 4 December 2027', 'US employment report: 5 December', 'jobs data out 5 December', 'Nonfarm payrolls, Fri 5 Dec', 'Jobs report: **5 December**',
    'A bullish jobs report is coming', 'After NFP the dollar will rally', 'NFP will push EURUSD higher', 'A strong jobs report lifts the dollar', 'Expect a beat on payrolls', 'The jobs report is 4 December. The dollar will rally after it.', 'Gold falls. The jobs report does that.',
  ]) assert.ok(one(t, W49).block.length, t);
  for (const t of ['The Fed meets 4 December', 'Fed meeting, 9-10 December', 'Interest rate decision on 10 December', 'Fed decision, Thursday 9 December', 'The Fed will cut rates', 'The Fed is expected to hold', 'Jobs report 9 December, Fed 4 December', 'A rate hike from the Fed is coming']) assert.ok(one(t, W50).block.length, t);
});
test('slips that cannot be judged are only warnings', () => {
  for (const t of ['Consensus for the jobs report is 150k', 'The jobs report is tomorrow', "Tomorrow's jobs report", 'NFP this Friday: plan ahead', 'Jobs report: 12/5', 'The jobs report is on the 5th']) {
    const { block, warn } = one(t, W49);
    assert.deepEqual([block.length, warn.length], [0, 1], t);
  }
});
test('each field is read on its own', () => {
  assert.deepEqual(eventIssues(['Before the jobs report', 'Write your journal by 2 December'], W49), { block: [], warn: [] });
});
test('only slots before the event are offered, and a late one is flagged', () => {
  const fed = eventNotes(W50, WEEKLY_SLOTS);
  assert.match(fed, /Pre-Trade Check \(tue\)/);
  assert.doesNotMatch(fed, /Trader's Mind|Inside Zenlot|Weekend Review/);
  assert.match(eventNotes(W49, WEEKLY_SLOTS), /Trader's Mind \(thu\)/);
  assert.equal(lateForEvent(['Fed decision'], W50, WEEKLY_SLOTS[3]).length, 1);
  assert.equal(lateForEvent(['Fed decision'], W50, WEEKLY_SLOTS[1]).length, 0);
  assert.equal(lateForEvent(['Trade less'], W50, WEEKLY_SLOTS[3]).length, 0);
});
test('a hand-edited caption or alt text is checked again before publishing', async () => {
  const slides = [{ layout: 'cover', kicker: 'k', title: 'Check the calendar', body: 'Know the date.', stat: '', items: [], screen: '', theme: 'dark' }];
  const qa = (caption: string, altText: string) => qaPost({ slides, caption: `${caption} Not financial advice.`, altText, scheduledAt: '2026-12-01T13:00:00Z' } as unknown as Parameters<typeof qaPost>[0]);
  assert.ok((await qa('Jobs report: 5 December.', 'x')).blocking.some((b) => b.includes('5 December')));
  assert.ok((await qa('Fine.', 'Slide about the jobs report on 5 December')).blocking.some((b) => b.includes('5 December')));
  assert.ok(!(await qa('Jobs report: 4 December.', 'x')).blocking.some((b) => b.includes('December')));
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
  const { posts } = await checkPlan(plan, WEEKLY_SLOTS, W49);
  assert.ok(posts[0].held.some((h) => h.includes('5 December')));
  assert.ok(!posts[1].held.some((h) => h.includes('December')));
});
