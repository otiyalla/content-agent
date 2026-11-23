// ---------------------------------------------------------------------------
// Brand guard: one set of copy rules for every channel (Instagram, X, Reddit).
// It catches wording that breaks the rules in src/config/zenlot.ts: claims the
// product can't back up, invented testimonials, invented personal trading
// history, and "guaranteed results" language. A hit blocks automatic posting;
// the draft goes to the owner instead.
// ---------------------------------------------------------------------------

interface Rule {
  pattern: RegExp;
  why: string;
}

const RULES: Rule[] = [
  // Overclaiming what the product does (zenlot.ts: "Don't call it enforcement").
  { pattern: /\benforc\w*/i, why: 'enforcement language; Zenlot recommends, warns, records and can block entries in the app' },
  { pattern: /\bzenlot\s+(forces|makes|stops|prevents|won't let|will not let)\b/i, why: 'claims Zenlot controls the trader' },
  { pattern: /\bforces you to\b/i, why: '"forces you to" overclaims; say "asks you to" or "shows you"' },
  { pattern: /\b(connects?|syncs?|links?) (to|with) (your )?brokers?\b/i, why: 'Zenlot does not connect to brokers' },
  { pattern: /\b(auto[- ]?(trades?|executes?|sizes|sizing)|places? (real )?orders? for you)\b/i, why: 'Zenlot does not place or size real orders' },

  // Results and advice.
  // Only promises of outcomes: "a losing streak is guaranteed to show up" is fine teaching.
  {
    pattern:
      /\bguarantee[sd]?\s+(?:\w+\s+){0,3}?(profits?|returns?|results?|wins?|winners|income|gains?|success|money)\b|\b(profits?|returns?|results?|wins?|income|gains?|success) (?:are |is )?guaranteed\b/i,
    why: 'promises results; Zenlot does not guarantee results',
  },
  { pattern: /\b(risk[- ]free|sure[- ]fire|can't lose|cannot lose)\b/i, why: 'implies risk-free trading' },
  { pattern: /\b(buy|sell|entry|trade) signals?\b|\bsignal (group|service)\b|\bcopy my trades\b/i, why: 'reads as a signals offer' },

  // Invented social proof.
  { pattern: /\b(traders|users|people|customers|members) (say|said|tell us|told us|love|swear by)\b/i, why: 'invented testimonial' },

  // Invented personal trading history (zenlot.ts: only the written founder story may be used).
  { pattern: /\bI(?:'ve| have)? (?:been )?trad(?:e|ed|ing) for (?:\d+|X|several|many|over)\b/i, why: 'invented trading experience' },
  { pattern: /\b(?:\d+|X) years? (?:of )?trading\b/i, why: 'invented trading experience' },
  { pattern: /\bI (?:blew|wiped|lost) (?:my|an|a|two|three)\b/i, why: 'invented trading history' },
  { pattern: /\b(?:changed|transformed) how I (?:trade|manage)\b/i, why: 'invented personal result' },
];

/** Returns one short message per broken rule. Empty array = clean. */
export function lintCopy(text: string): string[] {
  const issues: string[] = [];
  for (const { pattern, why } of RULES) {
    const m = text.match(pattern);
    if (m) issues.push(`"${m[0]}": ${why}`);
  }
  return issues;
}
