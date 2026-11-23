// ---------------------------------------------------------------------------
// How Zenlot answers comments. Used by the comment digest (instagram-comments.ts)
// to draft replies, and mirrored for people in docs/COMMUNITY.md.
// Drafts are never posted automatically: a person reads, edits and posts them.
// ---------------------------------------------------------------------------

export const COMMENT_CATEGORIES = [
  'distress', // big losses, hopelessness, "I lost everything"
  'impersonation', // an account pretending to be Zenlot
  'scam', // DM bait, "signals", account managers, recovery services, contact numbers
  'advice-request', // "what should I buy?", "is EURUSD going up?", "check my trade"
  'product-question', // how Zenlot works, pricing, platforms, features
  'education-question', // a question about the post's topic
  'disagreement', // pushback or criticism of the post
  'praise', // thanks, "great post"
  'spam', // irrelevant promotion, bots
  'other',
] as const;

export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export const URGENT: CommentCategory[] = ['distress', 'impersonation', 'scam'];

export const PLAYBOOK = `
Voice: calm, kind, brief (1-3 sentences). Sound like a person, not a brand bot. No emojis spam (at most one).
Never give financial advice, trade calls, price predictions or opinions on a specific trade. Never promise results.
Never ask anyone to DM, and never reply with contact details other than the official link in bio.
Only describe Zenlot features that exist (it's a free forex trading journal: plans, records and reviews trades
against your rules; recommends a lot size; warns about limits; no broker connection, never places trades).

By category:
- distress: Lead with care, not product. Acknowledge it's hard, suggest stepping away from the charts for now and
  talking to someone they trust. If they might be in danger, encourage contacting local emergency services.
  Never mention Zenlot, never teach, never say "it's normal". Flag for the owner to check on them.
- impersonation: Don't argue with the account. Reply under the comment so followers see it: our only account is
  @zenlot_app and we never DM for money. The owner reports the account in the Instagram app.
- scam: Recommend hiding the comment. If a reply helps followers, use the safety line: we never DM for money,
  deposits or signals. Never engage with the scammer.
- advice-request: Kindly decline to call trades or prices. Offer the process instead (define risk first, size from
  the stop, write the reason down). Example: "We don't give trade calls, but here's how we'd size any trade: ..."
- product-question: Answer factually from the feature list. It's free on iOS and Android; point to the link in bio.
- education-question: Answer the question directly with the maths or method. Keep numbers correct.
- disagreement: Thank them, take the strongest part of their point seriously, clarify calmly. Never get defensive.
- praise: A short, genuine thank-you. Optionally invite them to save or follow for the next one.
- spam: No reply. Recommend hiding.
- other: Reply only if there's something useful to say.
`.trim();

/** Deterministic red flags, checked before (and regardless of) the model. */
export function redFlags(username: string, text: string): CommentCategory | null {
  const u = username.toLowerCase();
  if (u.includes('zenlot') && u !== 'zenlot_app') return 'impersonation';
  const scam =
    /\b(dm|inbox|message)\s+(me|us)\b|whats\s?app|telegram|wa\.me|t\.me\/|signal\s+(group|room|channel)|account\s+manager|recover(y|ing)?\s+(your\s+)?(funds|money|account)|guaranteed\s+(profit|returns?)|invest\s+with\s+(me|us)|\+?\d[\d\s().-]{8,}\d/i;
  return scam.test(text) ? 'scam' : null;
}
