// ---------------------------------------------------------------------------
// Maths check: recomputes the arithmetic a post shows, in code, instead of
// trusting the model that wrote it.
//
// It checks three shapes of claim and ignores everything it can't parse (so it
// never blocks a post on a false alarm from prose it doesn't understand):
//
//   1. Written-out sums:     "3 ÷ 7 = 42.9%", "0.6^5 ~ 7.8%", "0.35R − 0.45R = −0.1R",
//                            "$50 risk ÷ (25 pips × $10) = 0.2 lots", and chains of them
//   2. Drawdown recovery:    "−30% needs +42.9%", "A 50% loss needs a 100% gain",
//                            a stat slide "+42.9%" titled "...recover from a 30% loss"
//   3. Losing streaks:       "10 straight losses at 1% risk: about −9.6%"
//
// A stated result must round to the computed one at the precision it's written
// with. "about", "roughly", "~" and similar allow a little more slack.
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20,
};
const SUPERSCRIPT_DIGITS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

function clean(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/[−–]/g, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPT_DIGITS[c]).join('')}`)
    .replace(/≈|≃|∼/g, '~');
}

const decimals = (num: string) => (num.split('.')[1] ?? '').length;
const toNumber = (num: string) => Number(num.replace(/,/g, ''));

/**
 * Does `stated` (as written, e.g. "42.9") match `actual`? Exact claims must
 * round to it; approximate ones may be off by one unit in the last digit or 3%.
 */
function matches(actual: number, stated: string, approx: boolean): boolean {
  const s = toNumber(stated);
  const unit = 10 ** -decimals(stated);
  const tolerance = approx ? Math.max(unit, Math.abs(s) * 0.03) : unit / 2;
  return Math.abs(actual - s) <= tolerance + 1e-9;
}

const fmt = (n: number) => {
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(3);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

// ---------------------------------------------------------------------------
// 1. Written-out sums
// ---------------------------------------------------------------------------

// Units say what a number counts. They don't change its size, but they do decide whether two sides can be
// compared ("0.5 lots x 25 pips = $125" hides a pip value, so it isn't checked).
type Unit = 'R' | 'pip' | 'lot' | 'money' | '';
type Token = {
  kind: 'num' | 'op' | 'label';
  start: number;
  end: number;
  value: number; // num: percentages are fractions
  raw: string; // num: the digits as written
  pct: boolean;
  unit: Unit;
  op: string;
};
type Num = Token & { kind: 'num' };

// Words that may sit inside a sum without changing it: "$50 risk ÷ (25 pip stop × $10 a pip)".
const LABEL =
  /(?:(?:\/|per\b|an?\b|each\b)\s*)(?:pip|lot|trade|point|unit)s?\b|(?:of\s+)?(?:risk(?:ed)?|stop(?:[- ]loss)?|account|balance|equity|target|reward|profit|gain|wins?|winners?|loss(?:es)?|losers?|losing|winning|avg|average|trades?|units?|standard|mini|micro|each)\b/iy;
const NUMBER =
  /(USD|EUR|GBP|CAD|AUD|NZD|CHF|[$€£])?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:\s*(%)|(?:\s*|-)(R|pips?|points?|lots?|(?:standard|mini|micro)\s+lots?|USD|EUR|GBP|CAD|AUD|NZD|CHF|dollars?)(?![a-z]))?(?:(k|mn?|bn)(?![a-z])|\s*(thousand|million|billion)\b)?/iy;
const WORD_OPS: Array<[RegExp, string]> = [
  [/plus\b/iy, '+'],
  [/minus\b/iy, '-'],
  [/times\b/iy, '*'],
  [/divided\s+by\b/iy, '/'],
];

const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

function unitOf(prefix: string | undefined, suffix: string | undefined): Unit {
  if (prefix) return 'money';
  if (!suffix) return '';
  if (/^r$/i.test(suffix)) return 'R';
  if (/pip|point/i.test(suffix)) return 'pip';
  if (/lot/i.test(suffix)) return 'lot';
  return 'money';
}

/** Reads the token at `pos`, or null if what's there isn't part of a sum. */
function tokenAt(t: string, pos: number, prev: Token | undefined): Token | null {
  const base = { start: pos, value: 0, raw: '', pct: false, unit: '' as Unit, op: '' };
  const at = (re: RegExp) => {
    re.lastIndex = pos;
    return re.exec(t);
  };
  // Not a digit in the middle of a word or a longer number ("W49", "EURUSD1").
  const n = /[\w]/.test(t[pos - 1] ?? '') && prev?.end !== pos ? null : at(NUMBER);
  if (n) {
    const value = toNumber(n[2]) / (n[3] ? 100 : 1);
    return { ...base, kind: 'num', end: pos + n[0].length, raw: n[2], value: value * (SCALES[(n[5] ?? n[6] ?? '').toLowerCase()] ?? 1), pct: Boolean(n[3]), unit: unitOf(n[1], n[4]) };
  }
  // "2% of $5,000" multiplies; "x" multiplies only in front of a number, bracket or label ("2.5x" is a multiple).
  if (prev?.kind === 'num' && prev.pct) {
    const of = at(/of\s+(?=an?\s+[$€£\d]|[$€£\d(])(?:an?\s+)?/iy);
    if (of) return { ...base, kind: 'op', op: '*', end: pos + of[0].length };
  }
  const label = at(LABEL);
  if (label) return { ...base, kind: 'label', end: pos + label[0].length };
  for (const [re, op] of WORD_OPS) {
    const w = at(re);
    if (w) return { ...base, kind: 'op', op, end: pos + w[0].length };
  }
  if (/x/i.test(t[pos])) {
    const next = pos + 1 + (/^\s*/.exec(t.slice(pos + 1))?.[0].length ?? 0);
    LABEL.lastIndex = next;
    const operand = /^(?:[-+(.$€£\d]|USD|EUR|GBP|CAD|AUD)/.test(t.slice(next)) || (next > pos + 1 && LABEL.test(t));
    if (!operand || !prev) return null;
    return { ...base, kind: 'op', op: '*', end: pos + 1 };
  }
  const op = { '×': '*', '*': '*', '÷': '/', '/': '/', '+': '+', '-': '-', '^': '^', '(': '(', ')': ')' }[t[pos]];
  return op ? { ...base, kind: 'op', op, end: pos + 1 } : null;
}

const isOperator = (tok: Token | undefined) => tok?.kind === 'op' && tok.op !== '(' && tok.op !== ')';

/** Splits a line into runs of sum tokens. Anything else (words, commas, full stops) ends a run. */
function runs(line: string): Token[][] {
  const out: Token[][] = [];
  let run: Token[] = [];
  let pos = 0;
  while (pos < line.length) {
    if (/\s/.test(line[pos])) {
      pos++;
      continue;
    }
    // Words start a label or operator only at a word boundary.
    const midWord = /[a-z]/i.test(line[pos]) && /[a-z]/i.test(line[pos - 1] ?? '');
    const tok = midWord ? null : tokenAt(line, pos, run[run.length - 1]);
    if (tok) {
      run.push(tok);
      pos = tok.end;
    } else {
      if (run.length) out.push(run);
      run = [];
      const word = /[a-z'’]+/iy;
      word.lastIndex = pos;
      pos += word.exec(line)?.[0].length ?? 1;
    }
  }
  if (run.length) out.push(run);
  return out;
}

/**
 * Evaluator for + - * / ^ and brackets. Returns null if it can't parse.
 * With `ofBase`, "$10,000 - 10%" takes 10% of the amount before it.
 */
function evaluate(tokens: Token[], ofBase: boolean): number | null {
  let i = 0;
  const isOp = (op: string) => tokens[i]?.kind === 'op' && tokens[i].op === op;

  function primary(): number | null {
    const t = tokens[i];
    if (!t) return null;
    if (t.kind === 'num') {
      i++;
      return t.value;
    }
    if (t.op === '(') {
      i++;
      const v = expr();
      if (v === null || !isOp(')')) return null;
      i++;
      return v;
    }
    if (t.op === '-' || t.op === '+') {
      i++;
      const v = power();
      return v === null ? null : t.op === '-' ? -v : v;
    }
    return null;
  }
  function power(): number | null {
    const base = primary();
    if (base === null) return null;
    if (isOp('^')) {
      i++;
      const exp = power();
      return exp === null ? null : base ** exp;
    }
    return base;
  }
  function term(): number | null {
    let v = power();
    while (v !== null && (isOp('*') || isOp('/'))) {
      const op = tokens[i++].op;
      const r = power();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number | null {
    const first = i;
    let v = term();
    const basePct = i === first + 1 && tokens[first].pct;
    while (v !== null && (isOp('+') || isOp('-'))) {
      const op = tokens[i++].op;
      const from = i;
      const r = term();
      if (r === null) return null;
      const change = ofBase && !basePct && i === from + 1 && tokens[from].pct ? v * r : r;
      v = op === '+' ? v + change : v - change;
    }
    return v;
  }

  const v = expr();
  return v !== null && i === tokens.length && Number.isFinite(v) ? v : null;
}

const nums = (tokens: Token[]) => tokens.filter((t): t is Num => t.kind === 'num');
const hasOp = (tokens: Token[], ...ops: string[]) => tokens.some((t) => t.kind === 'op' && ops.includes(t.op));

/** Whether it joins two or more numbers, as opposed to one signed number. */
const isSum = (tokens: Token[]) => nums(tokens).length > 1;

/** The sum that ends a run: drops unmatched brackets and anything before two numbers in a row ("Step 1: "). */
function leftSide(run: Token[]): Token[] | null {
  let from = 0;
  let depth = 0;
  for (let i = run.length - 1; i >= 0; i--) {
    if (run[i].op === ')') depth++;
    if (run[i].op === '(') {
      if (depth === 0) {
        from = i + 1; // "(0.2 lots x $10 = $2)": the sum starts inside the bracket
        break;
      }
      depth--;
    }
  }
  let side = run.slice(from);
  if (depth > 0) {
    const close = side.findIndex((t, i) => t.op === ')' && !side.slice(0, i).some((s) => s.op === '('));
    if (close < 0) return null;
    side = side.slice(close + 1); // "2) 3 x 4 = 12"
  }
  side = side.filter((t) => t.kind !== 'label');
  for (let i = side.length - 1; i > 0; i--) {
    if (side[i].kind !== 'num' || side[i - 1].kind !== 'num') continue;
    // "1/2 $300": a fraction of an amount, not a thread number.
    const fraction = side[i - 2]?.op === '/' && side[i - 1].value >= 2 && side[i - 1].value <= 4;
    return fraction && side[i].unit === 'money' ? null : side.slice(i);
  }
  return side;
}

/** The result as a single number, with its sign, plus the rest of the run. */
function result(run: Token[]): { num: Num; sign: string; next: number } | null {
  const signed = run[0]?.op === '-' || run[0]?.op === '+';
  const num = run[signed ? 1 : 0];
  return num?.kind === 'num' ? { num: num as Num, sign: signed ? run[0].op : '', next: signed ? 2 : 1 } : null;
}

/** Whether a bare number in the result's unit can be compared with the left side at all. */
function comparable(left: Token[], res: Num, line: string): boolean {
  const has = (u: Unit) => nums(left).some((n) => n.unit === u);
  const money = nums(left).filter((n) => n.unit === 'money').length;
  const divides = hasOp(left, '/');
  // "0.5 lots x 25 pips x $10 = 2.5%" is of an account we can't see.
  const hidden = has('lot') || has('pip') || (has('money') && /\b(?:account|balance|equity)\b/i.test(line));
  if (res.pct && hidden && !divides) return nums(left).some((n) => n.pct);
  switch (res.unit) {
    case 'money':
      return money > 0 || !(has('pip') || has('lot') || has('R')); // hides a pip value or the size of 1R
    case 'lot':
      return has('lot') || (has('pip') ? money > 1 : true);
    case 'R':
      return has('R') || divides || !(has('money') || has('pip') || has('lot'));
    case 'pip':
      return has('pip') || !(has('money') || has('lot'));
    default:
      return true;
  }
}

/** Whether the sum itself turns a fraction into a percentage: "3 ÷ 7 x 100". Dividing by 100 doesn't count. */
function timesHundred(left: Token[]): boolean {
  let depth = 0;
  return left.some((t, i) => {
    if (t.op === '(') depth++;
    if (t.op === ')') depth--;
    if (depth || t.kind !== 'num' || t.pct || t.value !== 100) return false;
    return left[i - 1]?.op === '*' || (i === 0 && left[1]?.op === '*');
  });
}

/**
 * How far a right-hand sum may be from the left because its numbers were rounded when written ("1 ÷ 3 = 0.17 + 0.17").
 * Nothing if the left is exact at the precision shown; otherwise what half a unit in each decimal it introduces could change.
 */
function roundingSlack(left: Token[], right: Token[], value: number): number {
  const places = Math.max(...nums(right).map((n) => decimals(n.raw) + (n.pct ? 2 : 0)));
  const scaled = value * 10 ** places;
  if (!hasOp(left, '/', '^') && Math.abs(scaled - Math.round(scaled)) < 1e-6) return 0;
  const base = evaluate(right, false);
  if (base === null) return 0;
  const given = new Set(nums(left).map((n) => n.raw));
  let slack = 0;
  right.forEach((t, i) => {
    if (t.kind !== 'num' || !decimals(t.raw) || given.has(t.raw)) return;
    const half = (10 ** -decimals(t.raw) / 2) * Math.abs(t.value / (toNumber(t.raw) || 1)); // keeps % and k
    const moved = evaluate(right.map((o, j) => (j === i ? { ...o, value: o.value + half } : o)), false);
    if (moved !== null) slack += Math.abs(moved - base);
  });
  return slack;
}

/** "0.2 standard lots + 2 mini lots": different sizes, so the numbers don't add up as written. A plain lot is standard. */
function mixesLotSizes(sum: string): boolean {
  const sizes = [...sum.matchAll(/\b(standard|mini|micro)\b|\blots?\b/gi)]
    .filter((m) => m[1] || !/\b(?:standard|mini|micro)[\s-]*$/i.test(sum.slice(0, m.index)))
    .map((m) => (m[1] ?? 'standard').toLowerCase());
  return new Set(sizes).size > 1;
}

/** "EUR 100 + USD 100 = USD 210" needs an exchange rate. "$" counts as USD unless a code follows the amount ("$50 CAD"). */
function mixesCurrencies(sum: string): boolean {
  const same: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', DOLLAR: 'USD', DOLLARS: 'USD' };
  const text = sum.replace(/\$(?=\s*[\d.,]*\d\s*(?:CAD|AUD|NZD)\b)/gi, '');
  const found = [...text.matchAll(/[$€£]|\b(?:USD|EUR|GBP|CAD|AUD|NZD|CHF|dollars?)(?![a-z])/gi)].map((m) => m[0].toUpperCase());
  return new Set(found.map((c) => same[c] ?? c)).size > 1;
}

/** Lines of text, with a sum that wraps onto the next line put back together. List items stay apart. */
function sumLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    // "= ..." after a blank line still belongs to the sum above it.
    if (/^\s*=(?!>)/.test(line)) while (out.length && !out[out.length - 1].trim()) out.pop();
    const prev = out[out.length - 1]?.trimEnd();
    const unfinished = prev !== undefined && /(?:[=~]|[\d)%a-z]\s*[-+*/×÷^]|[\d)%a-z]\s+x|\b(?:equals|plus|minus|times|divided\s+by))$/i.test(prev) && /\d/.test(prev);
    const continues =
      prev !== undefined &&
      /[\d)%a-z]$/i.test(prev) &&
      /\d/.test(prev) &&
      (/^\s*(?:=(?!>)|[×÷]|\/\s|x\s+[\d($]|(?:equals|plus|minus|times|divided\s+by)\s)/i.test(line) ||
        // A leading "-", "+" or "*" is a bullet unless the line before is an open sum.
        (/^\s*[-+*]\s*[\d($(]/.test(line) && !LIST_MARK.test(prev) && !/[=~]/.test(prev) && /[\d)%R]\s*(?:[*×÷/]|x\s)\s*[\d($]/i.test(prev) && /[\d)%R]$/.test(prev)));
    if ((unfinished || continues) && line.trim()) out[out.length - 1] = `${prev} ${line.trimStart()}`;
    else if (line.trim() || !unfinished) out.push(line);
  }
  return out;
}

const LOSS_CONTEXT =
  /\b(?:loss(?:es)?|lose[sr]?|losers|losing|lost|drawdown|down\s+(?:(?:to|by|at)\s+)?-?\d[\d.]*\s*(?:%|R)|(?:account|day|week|month)(?:'s|\s+is)?\s+down|stopped|stops?\s+(?:\w+\s+)?hit|(?:more|another)\s+stops?)(?![a-z])/i;

/** Whether + or - joins amounts in different units: "1.1000 - 25 pips", "2R + $50". */
function mixesUnits(tokens: Token[]): boolean {
  type Term = Set<Unit | '%'>;
  let mixed = false;
  const close = (terms: Term[]) => {
    const kinds = terms.filter((t) => t.size === 1).map((t) => [...t][0]);
    const has = (u: Unit | '%') => kinds.includes(u);
    const units = new Set(kinds.filter((u) => u && u !== '%'));
    if (units.size > 1 || (has('pip') && has('')) || (has('R') && has('%'))) mixed = true;
  };
  const stack: Term[][] = [[new Set()]];
  for (const t of tokens) {
    const terms = stack[stack.length - 1];
    const term = terms[terms.length - 1];
    if (t.kind === 'num') {
      const kind = t.pct ? '%' : t.unit;
      // A bare or % factor doesn't change what the term counts: "40% x 2R" is R.
      if (kind === '' || kind === '%') {
        if (!term.size) term.add(kind);
      } else {
        term.delete('');
        term.delete('%');
        term.add(kind);
      }
    } else if (t.op === '+' || t.op === '-') {
      if (term.size) terms.push(new Set());
    } else if (t.op === '(') stack.push([new Set()]);
    else if (t.op === ')' && stack.length > 1) {
      const inner = stack.pop()!;
      close(inner);
      const outer = stack[stack.length - 1][stack[stack.length - 1].length - 1];
      for (const kind of inner.flatMap((i) => [...i])) if (kind || !outer.size) outer.add(kind);
      if (outer.size > 1) outer.delete('');
    }
  }
  for (const terms of stack) close(terms);
  return mixed;
}

/** How many pips one unit of price can be, judged by how the prices are written. */
function pipScales(left: Token[]): number[] {
  const places = Math.max(...nums(left).map((n) => decimals(n.raw)));
  if (places >= 4) return [10000];
  if (places >= 2) return nums(left).some((n) => n.value >= 500) ? [10, 100] : [100]; // gold counts 0.1 or 0.01
  return places === 1 ? [1, 10] : [];
}

/** Values the left side may mean, in the units the result is written in. */
function candidates(left: Token[], res: Num, sign: string, aboutLosses: boolean): number[] {
  const values = [evaluate(left, false), evaluate(left, true)].filter((v): v is number => v !== null);
  const out: number[] = [];
  const addsOnly = !hasOp(left, '*', '/', '^');
  for (const v of values) {
    const prices = res.unit === 'pip' && addsOnly && !nums(left).some((n) => n.unit === 'pip' || n.pct) && pipScales(left).some((p) => p > 10);
    if (!prices) out.push(res.pct ? v * 100 : v);
    if (res.pct && (timesHundred(left) || (addsOnly && !nums(left).some((n) => n.pct)))) out.push(v); // "3 ÷ 7 x 100 = 42.9%"
    if (!res.pct && !res.unit && addsOnly && nums(left).every((n) => n.pct)) out.push(v * 100); // "70% - 30% = 40 points"
    if (res.unit === 'pip' && addsOnly && !nums(left).some((n) => n.unit === 'pip')) {
      if (nums(left).every((n) => n.pct)) out.push(v * 100);
      // Two prices: only the distance is meant.
      for (const perUnit of pipScales(left)) out.push(Math.abs(v) * perUnit);
    }
  }
  // "3 losses x 1% = -3%", "1% + 1% = -2%": the minus marks a loss, when the text says so.
  if (aboutLosses && sign === '-' && !hasOp(left, '-', '/')) out.push(...out.map((v) => -v));
  return out;
}

const APPROX_BEFORE = /(?:~|\b(?:about|roughly|around|approx\w*|nearly|near|almost))\s*$/i;
const APPROX_AFTER = /^\s*(?:~|(?:about|roughly|around|approx\w*|nearly|near|almost)\b)\s*/i;
// The sum started earlier than we can read: "0.4 x avg size 2R = ...", "(stop of 25 pips x $10) = ...".
const CUT_SHORT = /(?:\s[-+]\s+|[*×÷^]\s*|[\d)%a-z]\s*\/\s*|(?<![a-z])x\s+)(?:~\s*)?(?:[a-z'’.-]+\s+){0,5}$/i;
// Bullets and thread numbers are not part of the sum.
const LIST_MARK = /^\s*(?:[-+*•]\s+|\d+[.)]\s+|\d+\/\d*\s+(?=[^\s\-+*/×÷x=~^]))/;

function checkEquations(text: string): string[] {
  const issues: string[] = [];
  const lines = sumLines(clean(text));
  for (const [n, raw] of lines.entries()) {
    const found = lineIssues(raw.replace(LIST_MARK, ''), lines[n - 1] ?? '');
    // "- 50 + 20" and "1/2 (3 + 4)" may be part of the sum rather than a list mark: flag only what's wrong both ways.
    const asWritten = /^\s*(?:[-+]\s|\d+\/)/.test(raw) ? lineIssues(raw, lines[n - 1] ?? '') : found;
    for (const [k, issue] of found) if (asWritten.has(k)) issues.push(issue);
  }
  return issues;
}

/** Wrong sums in one line, by the position of their "=" among the line's signs. */
function lineIssues(line: string, previous: string): Map<number, string> {
  const issues = new Map<number, string>();
  const signs = [...line.matchAll(/(?<![<>!=])=(?![=>])|~|\bequals\b/gi)];
  signs.forEach((m, k) => {
    const before = line.slice(0, m.index).trimEnd();
    const run = runs(before).pop();
    if (!run || run[run.length - 1].end !== before.length) return;
    const left = leftSide(run);
    if (!left || !isSum(left) || !left.length) return;
    const from = left[0].start;
    const lead = line.slice(0, from);
    const joined = run[run.indexOf(left[0]) - 1];
    if (joined?.kind === 'op' && joined.op !== '(' && joined.op !== ')') return;
    // "balance - 50 - 50 = ...": the first amount is a word.
    if (isOperator(left[0]) && /[a-z)]\s*$/i.test(lead)) return;
    if (CUT_SHORT.test(lead)) return;

    const rest = line.slice(m.index! + m[0].length);
    const about = APPROX_AFTER.exec(rest);
    const after = rest.slice(about?.[0].length ?? 0);
    const oneIn = /^\s*(\d+)\s+(?:in|out of)\s+(\d+)\b/i.exec(after);
    const rightRun = runs(after)[0];
    if (!rightRun || after.slice(0, rightRun[0].start).trim()) return;
    const approx = m[0] === '~' || Boolean(about) || APPROX_BEFORE.test(lead);
    const value = evaluate(left, false);
    if (value === null || mixesUnits(left)) return;
    const rightEnd = rightRun[rightRun.length - 1].end;
    const goesOn = /^\s*[=~]/.test(after.slice(rightEnd));
    const fullSum = `${line.slice(from, m.index)} ${after.slice(0, rightEnd)}`;
    if (mixesLotSizes(fullSum) || mixesCurrencies(fullSum) || (/\bpips?\b/i.test(fullSum) && /\bpoints?\b/i.test(fullSum))) return;
    const right = rightRun.filter((t) => t.kind !== 'label');
    const near = (part: Token[], v: number) =>
      [value, evaluate(left, true) ?? value].some((want) => {
        const slack = roundingSlack(left, part, want) + (approx ? Math.abs(want) * 0.03 : 0);
        return Math.abs(v - want) <= slack + 1e-9 * Math.max(1, Math.abs(want));
      });

    const res = result(rightRun);
    if (!res) {
      // "= (0.8 - 0.6)", which may run on: "= (0.8 - 0.6) x 100 trades = 20R".
      if (evaluate(right, false) === null || !isSum(right)) return;
      for (let end = right.length; end > (goesOn ? 0 : right.length - 1); end--) {
        const v = evaluate(right.slice(0, end), false);
        if (v !== null && near(right.slice(0, end), v)) return;
      }
      issues.set(k, `maths: "${line.slice(from, m.index).trim()} ${m[0]} ${after.slice(0, rightEnd).trim()}" but it works out to ${fmt(value)}`);
      return;
    }
    const { num, sign } = res;
    const tail = after.slice(num.end);
    if (/^:\d/.test(tail)) return; // a ratio
    if (oneIn) {
      const n = Number(oneIn[1]) / value;
      const off = Math.abs(n - Number(oneIn[2]));
      if (value > 0 && off <= Math.max(0.5, approx ? n * 0.1 : 0)) return;
      issues.set(k, `maths: "${line.slice(from, m.index).trim()} ${m[0]} ${oneIn[0].trim()}" but it works out to 1 in ${fmt(1 / value)}`);
      return;
    }
    if (!comparable(left, num, line)) return;

    const scale = num.raw && num.value ? (num.value * (num.pct ? 100 : 1)) / toNumber(num.raw) : 1; // 1000 for "5k"
    // The sum's own sentence and the one before it (or the line above).
    const sentences = lead.split(/(?<=[.!?])\s+/);
    const ahead = rest.split(/(?<=[.!?])\s/)[0];
    const nearby = `${sentences.length > 1 ? '' : previous}\n${sentences.slice(-2).join(' ')} ${line.slice(from, m.index)} ${ahead}`;
    const options = candidates(left, num, sign, LOSS_CONTEXT.test(nearby)).map((v) => v / scale);
    const negative = sign === '-';
    const rightValue = isSum(right) ? evaluate(right, false) : null;
    // A dash then words may be prose ("= 0.2R - 60% of the time"); any other complete sum is judged as a whole.
    const proseDash = right[res.next]?.op === '-' && /^\s*[a-z]/i.test(after.slice(rightEnd));
    const whole = rightValue !== null && !proseDash;
    // "3 ÷ 7 = 0.43 x 100 = 43%": the x 100 only turns the result into a percentage.
    const toPercent = timesHundred(right) && /^\s*[=~]\s*[-+]?[\d.]+\s*%/.test(after.slice(rightEnd));
    if (toPercent && rightValue !== null && Math.abs(rightValue / 100 - value) <= roundingSlack(left, right, value) / 100 + (approx ? Math.abs(value) * 0.03 : 0) + 1e-9) return;
    // A running calculation may carry on: "= 0.2R x 100 trades = 20R".
    if ((!whole || goesOn) && options.some((v) => matches(negative ? -v : v, num.raw, approx))) return;

    if (/^\s+x\s+[a-z]/i.test(after.slice(rightEnd))) return; // "= 2 x your size"

    // The right-hand side may be a sum of its own: "(0.4 x 2) - (0.6 x 1) = 0.8 - 0.6 = +0.2R", or a range.
    const range = right.length >= 3 && right[res.next]?.op === '-' && right[res.next + 1]?.kind === 'num' ? right[res.next + 1] : null;
    if (range && range.start === right[res.next].end) {
      const lo = toNumber(num.raw);
      const hi = toNumber(range.raw);
      const vals = range.pct && !num.pct ? options.map((v) => v * 100) : options;
      if (hi > lo && vals.some((v) => v >= lo && v <= hi)) return;
    }
    if (right.length > res.next) {
      // Unfinished ("= 2 x your stop"): can't be judged.
      const last = right[right.length - 1];
      if (isOperator(last) && last.op !== '-') return;
      // The whole of it, or if that doesn't parse or may run into prose, the longest part that does.
      for (let end = right.length; end > (whole ? right.length - 1 : res.next); end--) {
        const part = right.slice(0, end);
        const v = isSum(part) ? evaluate(part, false) : null;
        if (v === null) continue;
        if (near(part, v)) return;
      }
    }
    const shownLeft = line.slice(from, m.index).trim();
    const sumShown = right.length > res.next && rightValue !== null;
    const shownRight = after.slice(0, sumShown ? rightEnd : num.end).trim();
    issues.set(k, `maths: "${shownLeft} ${m[0]} ${shownRight}" but it works out to ${fmt(options[0] * scale)}${num.pct ? '%' : num.unit === 'R' ? 'R' : ''}`);
    });
  return issues;
}

// ---------------------------------------------------------------------------
// 2. Drawdown recovery: after losing L%, you need L / (100 - L) to get back.
// ---------------------------------------------------------------------------

const recoveryNeeded = (lossPct: number) => (lossPct / (100 - lossPct)) * 100;

function checkRecovery(text: string): string[] {
  const t = clean(text);
  const issues: string[] = [];
  const patterns = [
    // "-30% needs +42.9%", "about -40%, which needs roughly +67%"
    /-(\d+(?:\.\d+)?)%,?\s+(?:which\s+)?(?:needs|requires)\s+(about\s+|roughly\s+|around\s+|nearly\s+|~\s*)?\+(\d+(?:\.\d+)?)%/gi,
    // "A 50% loss needs a 100% gain"
    /(\d+(?:\.\d+)?)%\s+(?:loss|drawdown)\s+(?:needs|requires)\s+(?:a\s+|an\s+)?(about\s+|roughly\s+|around\s+|nearly\s+|~\s*)?\+?(\d+(?:\.\d+)?)%\s+(?:gain|return)/gi,
  ];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const loss = Number(m[1]);
      if (loss <= 0 || loss >= 100) continue;
      const need = recoveryNeeded(loss);
      if (!matches(need, m[3], Boolean(m[2]))) {
        issues.push(`maths: a ${m[1]}% loss needs +${fmt(need)}% to recover, not +${m[3]}%`);
      }
    }
  }
  return issues;
}

/** Stat slide whose title is "...recover from a 30% loss" and whose stat is the gain needed. */
function checkRecoveryStat(title: string, stat: string): string[] {
  const loss = /recover\w*\s+(?:from\s+)?(?:a\s+|an\s+)?(\d+(?:\.\d+)?)%\s+(?:loss|drawdown)/i.exec(clean(title));
  const gain = /^\s*\+?(\d+(?:\.\d+)?)%\s*$/.exec(clean(stat));
  if (!loss || !gain) return [];
  const need = recoveryNeeded(Number(loss[1]));
  return matches(need, gain[1], false) ? [] : [`maths: recovering from a ${loss[1]}% loss needs +${fmt(need)}%, but the stat says +${gain[1]}%`];
}

// ---------------------------------------------------------------------------
// 3. Losing streaks: N losses at r% risk each leaves 1 - (1 - r)^N down.
// ---------------------------------------------------------------------------

function checkStreaks(text: string): string[] {
  const issues: string[] = [];
  for (const sentence of clean(text).split(/(?<=[.!?])\s+|\n+/)) {
    const risks = [...sentence.matchAll(/(\d+(?:\.\d+)?)%\s+(?:risk|per trade)|\brisk(?:ing)?\s+(\d+(?:\.\d+)?)%/gi)];
    const counts = [...sentence.matchAll(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+(?:straight\s+|consecutive\s+|losing\s+)?(?:losses|losing trades)\b/gi)];
    const results = [...sentence.matchAll(/(about|roughly|around|near|nearly|~)?\s*-(\d+(?:\.\d+)?)%/gi)];
    if (risks.length !== 1 || counts.length !== 1 || results.length !== 1) continue;

    const risk = Number(risks[0][1] ?? risks[0][2]) / 100;
    const n = WORD_NUMBERS[counts[0][1].toLowerCase()] ?? Number(counts[0][1]);
    const down = (1 - (1 - risk) ** n) * 100;
    const stated = results[0][2];
    if (!matches(down, stated, Boolean(results[0][1]))) {
      issues.push(`maths: ${n} losses at ${risk * 100}% risk each is -${fmt(down)}%, not -${stated}%`);
    }
  }
  return issues;
}

/** Maths problems in a piece of plain text, e.g. a caption or an X draft. */
export function textMathIssues(text: string): string[] {
  return [...new Set([...checkEquations(text), ...checkRecovery(text), ...checkStreaks(text)])];
}

/** All maths problems found in a post's slides and caption. */
export function mathIssues(post: { slides: Array<{ kicker: string; title: string; body: string; stat: string; items: string[] }>; caption: string }): string[] {
  const issues: string[] = [];
  post.slides.forEach((s, i) => {
    const text = [s.title, s.body, s.stat, ...s.items].join('\n');
    for (const issue of [...textMathIssues(text), ...checkRecoveryStat(s.title, s.stat)]) issues.push(`slide ${i + 1} ${issue}`);
  });
  for (const issue of textMathIssues(post.caption)) issues.push(`caption ${issue}`);
  return [...new Set(issues)];
}
