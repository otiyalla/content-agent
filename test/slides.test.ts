import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postAltTexts } from '../src/instagram/alt-text';
import { COLORS } from '../src/instagram/brand';
import { normalizeSlide, qaPost } from '../src/instagram/qa';
import { renderHash, renderSlideSvg } from '../src/instagram/renderer';
import { SCREENS, SCREEN_IDS } from '../src/instagram/screens';
import { MIN_PHONE_VISIBLE } from '../src/instagram/layout-check';
import { WEEKLY_SLOTS } from '../src/instagram/calendar';
import { checkPlan, usableWeek } from '../src/instagram/strategist';
import type { WeekPlan } from '../src/instagram/types';
import { phoneWidthFor, slideAsk, slideElement } from '../src/instagram/templates';
import type { Slide } from '../src/instagram/types';

const slide = (s: Partial<Slide>): Slide => ({ layout: 'point', kicker: '', title: 'Title', body: '', stat: '', items: [], screen: '', ...s });
const drawn = (s: Partial<Slide>, i = 0, total = 1, ask = {}) => JSON.stringify(slideElement(slide(s), i, total, ask));
const qa = async (s: Partial<Slide>) => (await qaPost({ slides: [slide(s)], caption: 'Not financial advice.', altText: 'x' })).blocking;

test('code notation on a slide is blocked, not printed', async () => {
  for (const title of ['0.6^5 = 7.8%', '0.6⁵ = 7.8%', '1 / 3 ~ 33%', '1 / 3 ≈ 33%', '25 pips ~ $250']) assert.ok((await qa({ title })).some((b) => b.includes('code notation')), title);
  for (const title of ['0.6 x 0.6 = 0.36', 'About 1 in 13', 'EURUSD (~$10 a pip)', 'Roughly ≈ 33%']) assert.deepEqual(await qa({ title }), [], title);
  assert.equal(normalizeSlide(slide({ title: 'about ~3 pips' })).title, 'about 3 pips');
  assert.equal(normalizeSlide(slide({ title: 'USD ~$10' })).title, 'USD about $10');
  assert.deepEqual(await qa({ title: 'Risk 1%', body: '~$10 a pip' }), []);
  assert.equal(normalizeSlide(slide({ title: 'EURUSD (~$10 a pip)' })).title, 'EURUSD (about $10 a pip)');
});
test('teal never marks a myth or a loss', () => {
  assert.ok(!drawn({ layout: 'mythfact', title: 'A **tight** stop', body: 'Plain' }).includes(`"color":"${COLORS.teal}","marginRight"`));
  for (const body of ['It ends at **−0.1R**', 'It ends at **-$50**', 'So **E = -0.1R**']) assert.ok(!drawn({ body }).includes(`"color":"${COLORS.teal}","marginRight"`), body);
  const range = drawn({ body: '**-1R to +2R**' });
  assert.ok(range.includes(`"color":"${COLORS.loss}","marginRight":"0.22em"},"children":"-1R"`) && range.includes(`"color":"${COLORS.teal}","marginRight":0},"children":"+2R"`));
  assert.ok(!drawn({ body: '**- 3 checks**' }).includes(`"color":"${COLORS.loss}"`));
  assert.ok(drawn({ body: 'It ends at **+0.1R**' }).includes(`"color":"${COLORS.teal}","marginRight"`));
  assert.ok(drawn({ layout: 'stat', stat: '−30%' }).includes(COLORS.loss));
});
test('the closing slide shows the post\'s own ask', async () => {
  const ask = { ctaType: 'follow' as const, series: 'Survival Maths' };
  const cta = drawn({ layout: 'cta' }, 2, 3, ask);
  assert.ok(cta.includes('for Survival Maths') && !cta.includes('"Save"'));
  assert.ok(drawn({ layout: 'list', items: ['a'] }, 0, 1, ask).includes('for Survival Maths'));
  assert.equal(slideAsk(slide({}), 0, 3, ask), '');
  assert.equal(slideAsk(slide({ layout: 'question' }), 0, 1, { ctaType: 'comment' }), '');
  assert.match(postAltTexts({ slides: [slide({}), slide({ layout: 'cta' })], altText: 'x', ...ask })[1], /for Survival Maths/);
  assert.equal(slideAsk(slide({ layout: 'question', body: 'Hypothetical: two losses.' }), 0, 1, { ctaType: 'comment' }), 'Answer in the comments');
  const long = postAltTexts({ slides: [slide({ layout: 'list' })], altText: 'word '.repeat(90), ...ask })[0];
  assert.ok(long.length <= 300 && long.endsWith('for Survival Maths.'), long);
  const post = { slides: [slide({ layout: 'cta' })], altText: 'x' };
  assert.notEqual(await renderHash({ ...post, ctaType: 'save' }), await renderHash({ ...post, ctaType: 'follow' }));
});
test('app screens are cut between rows', async () => {
  for (const screen of SCREEN_IDS) for (let visible = MIN_PHONE_VISIBLE; visible <= 980; visible += 5) {
    const s = slide({ layout: 'screen', screen });
    const w = phoneWidthFor(s, visible);
    const cut = ((visible - 16) * 738) / (w - 28);
    assert.ok(SCREENS[screen].rowEnds.some((y) => Math.abs(y - cut) < 3), `${screen} at ${visible}px: ${w}`);
    assert.ok(w >= 470 && w <= 760);
  }
  await renderSlideSvg(slide({ layout: 'screen', screen: 'insights' }), 0, 3);
});
test('series names are large on every first slide', () => {
  for (const layout of ['cover', 'point', 'stat', 'list', 'mythfact', 'quote', 'question'] as const) {
    assert.match(drawn({ layout, kicker: 'Pre-Trade Check' }), /"fontSize":46[^}]*\},"children":"Pre-Trade Check"/, layout);
  }
});
test('repeated hashtags, a closing screen and a mismatched closing title are warned about', async () => {
  const post = (slot: number, last: Partial<Slide>, tag: string) => ({
    slot, pillar: WEEKLY_SLOTS[slot].pillars[0], topic: 't', rationale: 'r', caption: 'Hi. Educational content, not financial advice.', hashtags: [tag, `own${slot}`], altText: 'alt', hookType: 'question', ctaType: 'save', series: '',
    slides: [slide({ layout: 'cover', title: 'One' }), slide({ title: 'Two' }), slide(last)],
  });
  const plan = { theme: 'x', posts: [post(0, { layout: 'cta', title: '**Follow** for more' }, 'Forex'), post(2, { layout: 'screen', screen: 'insights' }, 'forex'), post(4, { layout: 'cta', title: 'Follow your plan' }, 'forex')] } as unknown as WeekPlan;
  const check = await checkPlan(plan, WEEKLY_SLOTS);
  assert.ok(check.warnings.some((w) => /slot 0 closing title asks to follow/.test(w)));
  assert.ok(check.warnings.some((w) => /slot 2 ends on an app screen/.test(w)));
  assert.ok(!check.warnings.some((w) => /slot 4 closing title/.test(w)));
  check.posts.forEach((p) => (p.held = []));
  assert.ok(usableWeek('x', check, 0).warnings.some((w) => w.includes('#forex (3 posts)')));
});
