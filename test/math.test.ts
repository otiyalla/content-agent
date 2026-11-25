import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outbox } from '../src/services/outbox.service';
import { mathIssues, textMathIssues } from '../src/instagram/math-check';

const RIGHT = [
  // Published and planned posts
  "That's 3 ÷ 7 = **42.9%**.", 'Expectancy = 0.4 × 2 − 0.6 × 1 = **+0.2R** per trade.', '0.6⁵ ≈ **7.8%**, about 1 in 13.',
  'Win 70% at +0.5R, lose 30% at −1.5R: expectancy = 0.35 − 0.45 = **−0.1R** per trade.', "That's 0.35R − 0.45R = −0.1R per trade.",
  '$50 risk ÷ (25 pips × $10) = **0.2 lots**.', 'All figures check out (0.2 lots × $10 × 25 pips = $50; 0.5 × $10 × 60 = $300 = 6%).',
  'Formula: 1 ÷ (1 − loss) − 1.', '10 straight losses at 1% risk: about **−9.6%**.', 'A **50%** loss needs a **100%** gain to recover',
  // Chains, units, words
  '(0.4 x 2) - (0.6 x 1) = 0.8 - 0.6 = +0.2R', '(0.4 x 2R) − (0.6 x 1R) = 0.8R − 0.6R = 0.2R', '3 ÷ 7 = 0.43 x 100 = 43%',
  '1 ÷ (1 − 0.3) − 1 = 42.9%', '40% x 2R - 60% x 1R = 0.2R', '0.4 x avg win 2R - 0.6 x avg loss 1R = 0.2R', '0.35R minus 0.45R equals minus 0.1R',
  '2% of $5,000 = $100', '1% of a $10,000 account = $100', '$125 ÷ $5,000 = 2.5%', '$5k x 2% = $100', '50 x 100 = $5k', '$300 / $100 = 3R',
  '60 pips ÷ 25 pips = 2.4R', '25 pip stop x $10 a pip = $250 per lot', '25-pip stop × $10/pip × 0.2 lots = $50', 'USD 50 ÷ USD 250 = 0.2 lots',
  '0.5 lots x 60 pips x $10 per pip = about $300', '3 losses x 1% = -3%', 'Both lose: 1% + 1% = −2%', 'Two stops are hit, so the day is at 1% + 1% = -2%.', 'one more stop takes the day to 2% + 2% = -4%', 'Two losses\n1% + 1% = −2%',
  '0.4 x 2 - 0.6 x 1 = 0.2 - 40% of the time', '100 x 3 ÷ 7 = 42.9%', '50 / 100 = 50%', '100 trades x 1% = 100%', '(USD 125 / USD 5000 x 100) = 2.5%', '((3 ÷ 7) x 100) = 42.9%', '(50 - 40) / (80 - 30) x 100 = 20%', '1.1050 - 1.1000 = 25 pips + 25 pips', '1.1050 - 1.1000 = (25 pips + 25 pips)', '1 / 4 x 100 = 20% + 5%', '1 / 4 = 20% + 5%', 'Two losses: 1% + 1% = -1% - 1%', '$10,000 - 10% = $8,000 + $1,000', '0.4 x 2R − 0.6 x 1R = 0.2R × 100 trades = 20R', '0.2R x 100 trades = 20R / 100 = 0.2R', '1/2 (3 + 4) = 3.5', '1/2 $300 x 2 = 300',
  '- 50 + 20 = -30', '1/7 3 x 4 = 12', '$500,000 x 2 = $1M', '$500,000 x 2 = $1 million', '0.5 x 0.1 = 1 in 20', '0.4 x 2 - 0.6 x 1 = (0.8 - 0.6) = 0.2R', '(0.4 x 2 - 0.6) = (0.8 - 0.6) x 100 trades = 20R',
  '3 ÷ 7\n\n= 42.9%', '1900.50 - 1900.00 = 5 pips', '50 - 25 = 25 pips', 'The account is down: 1% + 1% = -2%', 'Two losses. 1% + 1% = -2%', '25 pips + 10 pips = 35 pips', '(40 x 2R - 60 x 1R) / 100 = 0.2R', '$100 CAD + $50 CAD = $150 CAD', 'USD 100 + $50 = 150 dollars', '0.4 x 2\n- 0.6 x 1 = 0.2R', '3 ÷ 7 =\n42.9%', '3 ÷ 7\n= 42.9%', '- 0.4 x 2 = 0.8\n- 0.6 x 1 = 0.6',
  '- 3 x 4\n- 0.6 x 1 = 0.6', 'Use 3 x 4\n\n2 + 2 = 4', 'Risk 1%\n- 2 + 2 = 4', '$50 ÷ (25 pips × $1) = 2 mini lots', '2 mini lots x 25 pips x $1 a pip = $50', '0.2 standard lots + 0.2 lots = 0.4 lots', '$1,000,000 x 2% = $10,000 + $10,000.00', '1 ÷ 3 + 1 ÷ 3 = 0.33 + 0.33', '1 ÷ 3 = about 0.17 + 0.16', '3 ÷ 7 = 0.429 x 100 = 42.9%', '$10,000 − 10% = $9,000', '100 x 1.1 = 110', '50 / 1000 = 5%', '3 ÷ 7 x 100 = 42.9%',
  '70% - 30% = 40 points', '0.6^5 = 1 in 13', '10 / 4 = 2.5x', '3.5 x 1 = 3-4', '2 + 2 = 4 - and that is all', '~0.4 x 2.02 = 0.8',
  '1.1050 − 1.1000 = 50 pips', '1.1000 − 1.1050 = 50 pips', '150.50 - 150.00 = 50 pips',
  // Lists
  '- 3 x 4 = 12', '1) 3 x 4 = 12', '1/ 3 x 4 = 12', '2. 3 x 4 = 12', 'Step 1\n3 x 4 = 12', 'max 3 x 4 = 12',
];

const WRONG: Array<[string, RegExp]> = [
  ['0.35R − 0.45R = −0.9R', /-0\.1R/], ['$50 risk ÷ (25 pips × $10) = 0.9 lots', /out to 0\.2/], ['0.35 − 0.45 = 0.1R', /-0\.1R/],
  ['(0.4 x 2) - (0.6 x 1) = 0.9 - 0.6 = +0.3R', /0\.8 |0\.2/], ['(0.4 x 2) - (0.6 x 1) = 0.8 - 0.6 = +0.3R', /0\.2R/],
  ['0.4 x 2R − 0.6 x 1R = 0.5R', /0\.2R/], ['2% of $5,000 = $150', /100/], ['0.2 lots × $10 × 25 pips = $60', /50/], ['25-pip stop × $10/pip × 0.2 lots = $75', /50/],
  ['$125 ÷ $5,000 = 4%', /2\.5%/], ['$10,000 − 10% = $9,500', /9/], ['60 pips ÷ 25 pips = 3R', /2\.4R/], ['0.35R minus 0.45R equals minus 0.9R', /-0\.1R/],
  ['0.4 x 2 - 0.6 x 1 = 0.1 + 0.1 + 0.3', /0\.2/], ['0.4 x 2 - 0.6 x 1 = 0.2 + 0.3', /0\.2/], ['0.4 x 2 - 0.6 x 1 = 0.2 - 0.1', /0\.2/],
  ['$1,000,000 x 2% = $10,000 + $9,900.00', /20000/], ['$125 ÷ $5,000 = 0.02 + 0.02', /0\.025/], ['3 ÷ 7 = 0.425 x 100 = 42.5%', /out to/],
  ['$50 ÷ (25 pips × $1) = 9 mini lots', /out to 2/], ['0.2 lots + 0.2 lots = 0.9 lots', /0\.4/], ['0.2 standard lots + 0.2 lots = 0.9 standard lots', /0\.4/],
  ['3 ÷ 7 =\n50%', /42\.86%/], ['0.4 x 2 - 0.6 x 1 =\n0.5R', /0\.2R/], ['0.4 x 2 -\n0.6 x 1 = 0.5R', /0\.2R/], ['0.4 x 2\n- 0.6 x 1 = 0.5R', /0\.2R/], ['3 ÷ 7\n= 50%', /42\.86%/],
  ['3 ÷ 7 =\n\n50%', /42\.86%/], ['EUR 100 + €100 = EUR 300', /200/], ['- 0.4 x 2 = 0.8\n- 0.6 x 1 = 0.9', /0\.6/],
  ['50 - 25 = 2500 pips', /25/], ['1.1050 - 1.1000 = 0.5 pips', /50/], ['Cutting risk down: 2 x 3 = -6', /out to 6/], ['$50 x 2 = 100%', /out to/], ['0.5 x 0.1 = 1 in 19', /1 in 20/],
  ['0.4 x 2 - 0.6 x 1 = (0.9 - 0.6) = 0.3R', /0\.2/], ['3 ÷ 7\n\n= 50%', /42\.86%/], ['$500,000 x 2 = $2M', /out to/], ['- 50 + 20 = -40', /out to/], ['1/7 3 x 4 = 13', /12/], ['* 3 x 4 = 13', /12/],
  ['0.4 x 2R − 0.6 x 1R = 0.3R × 100 trades = 30R', /0\.2R/], ['0.2R x 100 trades = 20R, then 20R / 100 = 0.4R', /0\.2R/], ['We lost. Later we won. So 2 x 3 = -6', /out to 6/],
  ['1.1050 - 1.1000 = 25 pips + 35 pips', /out to/], ['1 / 4 x 100 = 20% + 15%', /25/], ['1 / 4 = 20% + 15%', /25%/], ['0.35R - 0.45R = -0.9R - 60% of the time', /-0\.1R/], ['100 trades x 1% = 1%', /100%/], ['(50 / (100 x 2)) = 0.25%', /25%/], ['(USD 125 / USD 5000 x 100) = 3.5%', /out to/], ['1 / 4 = (20% + 15%)', /0\.25/], ['0.4 x 2R - 0.6 x 1R = 0.1R + 0.2R', /0\.2R/],
  ['3 ÷ 7 = 0.5 x 100 = 50%', /out to/], ['50 / 100 = 0.5%', /50%/], ['50 / (100 x 2) = 0.25%', /25%/], ['2 x 2 = -4', /out to 4/], ['$5,000 x 2% = -$100', /100/],
  ['1% + 1% = −3%', /2%/], ['- 3 x 4 = 13', /12/], ['1/ 3 x 4 = 13', /12/], ['(0.2 lots × $10 × 25 pips = $90)', /50/], ['$5k x 2% = $200', /100/], ['3 ÷ 7 = 0.43%', /42\.86%/],
  ['0.6^5 = 1 in 20', /1 in 12/], ['0.35R - 0.45R = -0.9R – and that adds up', /-0\.1R/], ['0.4 x avg win 2R - 0.6 x avg loss 1R = 0.5R', /0\.2R/],
  ['That is 0.5 lots x 60 pips x $10 per pip = about $350', /300/], ['1.1050 − 1.1000 = 60 pips', /out to/], ['10 straight losses at 1% risk: −12%', /9\.56/],
];

// Can't be judged, so never flagged.
const IGNORED = [
  '0.5 lots x 25 pips = $125', '1R is $100. 0.4 x 2R - 0.6 x 1R = 0.1R + $10', '0.4 x 2R - 0.6 x 1R = (0.1R + $10)', '0.5 lots x 25 pips = ($100 + $25)', '1.1000 - 25 pips = 1.0975', '2R + $50 = $150', '1R + 1% = 2%', '50 pips + 5 points = 50.5 pips', '5 x 3\n~ 10 minutes', 'On this account, 2 x $50 = 2%', 'At EURUSD 1.10: EUR 100 + USD 100 = USD 210', '€100 + $100 = $210', '$100 CAD + $50 = $120', '0.2 standard lots + 2 mini lots = 0.4 standard lots', '0.2 lots x 10 = 20 micro lots', '0.2 lots + 2 mini-lots = 0.4 lots', '$50 ÷ 25 pips = 0.2 lots', '1% of $5,000 = 1R', '0.5 lots x 25 pips x $10 = 2.5%', 'Win rate 0.4 x size 2R − edge rate 0.6 x 1R = 0.2R',
  '$50 ÷ (distance 25 pips × $10) = 0.2 lots', 'balance - 50 - 50 = 900', '3 x 4 = 2 x your size', '3 x 4 = 2 x risk', 'Risk : reward = 1:2', '4 / 2 = 1:2', '2(3+4) = 14',
  'RR >= 2 x 3', 'a 25-pip stop (~$10 a pip per lot)', 'W49 = 5 posts', 'https://x.com/a?b=1-2&c=3', '24/7 = always on', 'required gain = 1 ÷ (1 − loss) − 1', 'lot size = risk ÷ (pips × pip value)',
];

test('correct sums pass', () => {
  for (const t of RIGHT) assert.deepEqual(textMathIssues(t), [], t);
});
test('wrong sums are caught, with the right answer', () => {
  for (const [t, answer] of WRONG) {
    const issues = textMathIssues(t);
    assert.ok(issues.length, `missed: ${t}`);
    assert.match(issues[0], answer, t);
  }
});
test("sums that can't be judged are left alone", () => {
  for (const t of IGNORED) assert.deepEqual(textMathIssues(t), [], t);
});
test('slides, stats and captions are all checked', () => {
  const slide = (o: object) => ({ kicker: '', title: '', body: '', stat: '', items: [], ...o });
  const bad = '0.35R − 0.45R = −0.9R';
  assert.equal(mathIssues({ slides: [slide({ body: bad }), slide({ stat: bad }), slide({ items: [bad] })], caption: bad }).length, 4);
});
test('X drafts get the same check', () => {
  const held = (outbox as unknown as { held: Array<{ issues: string[] }> }).held;
  for (const [text, count] of [['$50 risk ÷ (25 pips × $10) = 0.9 lots', 1], ['$50 risk ÷ (25 pips × $10) = 0.2 lots', 0]] as const) {
    assert.equal(outbox.allow({ platform: 'x', kind: 'post', action: 'post', text } as Parameters<typeof outbox.allow>[0]), null);
    assert.equal(held[held.length - 1].issues.filter((i) => i.startsWith('maths:')).length, count);
  }
});
