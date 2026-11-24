import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintClaims, lintSaved } from '../src/content/claims-lint';
import { env } from '../src/config/env';
import { readBrief, safeField } from '../src/instagram/brief';
import { listWeeks, loadCalendar, WEEKLY_SLOTS } from '../src/instagram/calendar';
import { contentHash } from '../src/instagram/approval';
import { weekEntry } from '../src/instagram/account-metrics';
import { PlannedPostSchema, WeekPlanSchema } from '../src/instagram/types';
import { TOPIC_IDS } from '../src/instagram/taxonomy';
import { instagramService } from '../src/services/social/instagram.service';

test('AC-5: banned phrases are caught, ordinary teaching is not', () => {
  for (const t of ['our share of voice rose', 'Market share', 'trending on Instagram', 'the leading trading journal', 'a market-leading app', 'market leader']) assert.equal(lintClaims(t).length, 1, t);
  for (const t of ['leading to bigger losses', 'a trending market', 'share this post', 'the leading cause is size']) assert.deepEqual(lintClaims(t), [], t);
});

test('AC-17: competitor names, long quotes and other accounts are caught without printing them', () => {
  env.RADAR_COMPETITOR_NAMES = 'Rival Journal, Acme';
  try {
    for (const t of ['as @rivaljournal posts', 'Rival  Journal did well', 'ACME does this']) assert.ok(lintSaved(t).includes('names a competitor'), t);
    assert.deepEqual(lintClaims('acmeology is fine'), []);
    assert.ok(!lintSaved('Acme and @acme').join().toLowerCase().includes('acme'));
  } finally {
    env.RADAR_COMPETITOR_NAMES = '';
  }
  assert.deepEqual(lintSaved('see @someone_else'), ['names an account']);
  assert.deepEqual(lintSaved('follow @zenlot_app'), []);
  assert.deepEqual(lintSaved(`they said "${'x'.repeat(50)}"`), ['quotes someone at length']);
  assert.deepEqual(safeField('the market leader', 'Plan'), { text: 'Plan', problems: ['"leading" (can\'t be shown)'] });
});

test('briefs', () => {
  assert.equal(readBrief(undefined, WEEKLY_SLOTS), null);
  assert.equal(readBrief('NFP is Friday', WEEKLY_SLOTS), null);
  assert.deepEqual(readBrief('[brief:Q07 slot:MON] why 2% feels small', WEEKLY_SLOTS), { id: 'q07', day: 'mon' });
  for (const bad of ['[brief:q1]', '[brief:q1 slot:fri]', '[brief:q1 slot:mon] [brief:q2 slot:tue]', '[brief:a b slot:mon]']) assert.throws(() => readBrief(bad, WEEKLY_SLOTS), /brief/, bad);
  assert.throws(() => readBrief('copy @somebody', WEEKLY_SLOTS), /public/);
});

test('calendars saved before topics existed still load, and topics never change a preview fingerprint', () => {
  for (const week of listWeeks()) {
    for (const post of loadCalendar(week)!.posts) {
      assert.ok(post.id);
      assert.equal(contentHash({ ...post, topicId: 'drawdown', briefId: 'q1' } as typeof post), contentHash(post));
    }
  }
});

test('new plans must carry a topic from the list', () => {
  assert.ok(PlannedPostSchema.shape.topicId.safeParse(TOPIC_IDS[0]).success);
  assert.ok(!PlannedPostSchema.shape.topicId.safeParse('other').success);
  assert.ok(WeekPlanSchema);
});

test('AC-18: the bio link is website_clicks, and one failing metric leaves the others', async () => {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string) => {
    const metric = new URL(input).searchParams.get('metric')!;
    asked.push(metric);
    if (metric === 'reach') return new Response(JSON.stringify({ error: { message: 'gone' } }), { status: 400 });
    return new Response(JSON.stringify({ data: [{ name: metric, total_value: { value: metric === 'website_clicks' ? 5 : 3 } }] }));
  }) as unknown as typeof fetch;
  const a = await instagramService.getAccountInsights(new Date(0), new Date());
  assert.deepEqual(a, { profileViews: 3, websiteClicks: 5 });
  assert.ok(!asked.join().includes('profile_links_taps'));
  const w = weekEntry(a, undefined, new Date('2026-11-30T01:00:00Z')); // Sunday's report, slipped into Monday
  assert.deepEqual([w.id, w.reach, w.followers, w.websiteClicks], ['2026-W48', null, null, 5]);
});
