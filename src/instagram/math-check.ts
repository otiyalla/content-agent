// ---------------------------------------------------------------------------
// Maths check: recomputes the arithmetic a post shows, in code, instead of
// trusting the model that wrote it.
//
// It checks three shapes of claim and ignores everything it can't parse (so it
// never blocks a post on a false alarm from prose it doesn't understand):
//
//   1. Written-out sums:     "3 ÷ 7 = 42.9%", "0.6^5 ~ 7.8%", "0.35 − 0.45 = −0.1R"
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

type Token = { kind: 'num'; value: number } | { kind: 'op'; op: string };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:([$€£]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|[$€£]?\d+(?:\.\d+)?%?)|([-+*/^()×x÷]))/y;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    m = re.exec(expr);
    if (!m) return expr.slice(pos).trim() ? null : tokens;
    pos = re.lastIndex;
    if (m[1]) {
      const raw = m[1].replace(/^[$€£]/, '');
      const pct = raw.endsWith('%');
      tokens.push({ kind: 'num', value: toNumber(pct ? raw.slice(0, -1) : raw) / (pct ? 100 : 1) });
    } else {
      const op = m[2] === '×' || m[2] === 'x' ? '*' : m[2] === '÷' ? '/' : m[2];
      tokens.push({ kind: 'op', op });
    }
  }
  return tokens;
}

/** Recursive-descent evaluator for + - * / ^ and brackets. Returns null if it can't parse. */
function evaluate(tokens: Token[]): number | null {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (op: string) => peek()?.kind === 'op' && (peek() as { op: string }).op === op;

  function primary(): number | null {
    const t = peek();
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
    if (t.op === '-') {
      i++;
      const v = power();
      return v === null ? null : -v;
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
      const op = (tokens[i++] as { op: string }).op;
      const r = power();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number | null {
    let v = term();
    while (v !== null && (isOp('+') || isOp('-'))) {
      const op = (tokens[i++] as { op: string }).op;
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const v = expr();
  return v !== null && i === tokens.length && Number.isFinite(v) ? v : null;
}

const EXPR_CHARS = /[\d.,%$€£()\s×x*÷/+\-^]/;

function checkEquations(text: string): string[] {
  const issues: string[] = [];
  const t = clean(text);
  const signs = /(=|~)/g;
  let m: RegExpExecArray | null;
  while ((m = signs.exec(t))) {
    // Walk left over characters that can belong to a sum.
    let start = m.index;
    while (start > 0 && EXPR_CHARS.test(t[start - 1])) start--;
    const left = t.slice(start, m.index).trim().replace(/^[,.\s]+/, '');
    if (!/\d/.test(left) || !/\d\s*[-+*/^×x÷]\s*[-($€£\d]/.test(left)) continue;

    const right = /^\s*([+-]?)\s*[$€£]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%)?/.exec(t.slice(m.index + 1));
    if (!right) continue;
    const tokens = tokenize(left);
    const actual = tokens && evaluate(tokens);
    if (actual === null || actual === undefined) continue;

    const pct = Boolean(right[3]);
    const sign = right[1] === '-' ? -1 : 1;
    const shown = actual * (pct ? 100 : 1) * sign; // compare in the units the result is written in
    const approx = m[1] === '~' || /\b(about|roughly|around|approx\w*|nearly|near)\s*$/i.test(t.slice(Math.max(0, start - 20), start));
    if (!matches(shown, right[2], approx)) {
      issues.push(`maths: "${left} ${m[1]} ${right[1]}${right[2]}${right[3] ?? ''}" but it works out to ${sign < 0 ? '-' : ''}${fmt(shown * sign)}${pct ? '%' : ''}`);
    }
  }
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

/** All maths problems found in a post's slides and caption. */
export function mathIssues(post: { slides: Array<{ kicker: string; title: string; body: string; stat: string; items: string[] }>; caption: string }): string[] {
  const issues: string[] = [];
  post.slides.forEach((s, i) => {
    const text = [s.title, s.body, ...s.items].join('\n');
    for (const issue of [...checkEquations(text), ...checkRecovery(text), ...checkStreaks(text), ...checkRecoveryStat(s.title, s.stat)]) {
      issues.push(`slide ${i + 1} ${issue}`);
    }
  });
  for (const issue of [...checkEquations(post.caption), ...checkRecovery(post.caption), ...checkStreaks(post.caption)]) issues.push(`caption ${issue}`);
  return [...new Set(issues)];
}
