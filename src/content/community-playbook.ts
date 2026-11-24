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

// Deterministic red flags, in English, French and Spanish (the app's languages). They run whether or not a
// model is available, and are deliberately over-inclusive: a false alarm costs a minute, a miss can cost far more.
// Text is lower-cased and stripped of accents and curly quotes first, so patterns are written without them.
const DISTRESS = [
  // Danger to life.
  /\b(?:suicid\w*|kill(?:ing)? my ?self|kms|end(?:ing)? (?:it all|my life)|(?:want|wanna|going|ready) (?:to )?die|better off dead|no reason to live|(?:don'?t|do not) (?:want|wanna) (?:to )?(?:live|be here|wake up)|can'?t (?:go on|take (?:it|this) any ?more)|self[- ]harm|hurt(?:ing)? my ?self)\b/,
  /\b(?:me suicider|me tuer|en finir|envie de mourir|veux mourir|plus envie de vivre|n'?en peux plus|mettre fin a (?:mes jours|ma vie))\b/,
  /\b(?:suicidar\w*|matarme|me quiero matar|quiero morir\w*|ganas de (?:vivir|morir)|acabar con (?:todo|mi vida)|quitarme la vida|no puedo mas|no aguanto mas)\b/,
  // Serious loss or hopelessness.
  /\b(?:i(?:'ve| have)? (?:just )?(?:lost|blew|blown|gambled) (?:away )?(?:everything|it all|all (?:of )?my|my (?:life |whole |entire )?(?:savings|house|home|rent|salary|account|money|job|family|marriage|wife|husband))|lost (?:my )?life savings|ruined my life|(?:i'?m|i am|feel(?:ing)?) (?:so )?(?:hopeless|worthless|ruined|finished|desperate)|i(?:'m| am) (?:deep |drowning )?in debt|drowning in debt|nothing left)\b/,
  /\b(?:j'?ai (?:tout|toutes? mes|mes|mon|ma) (?:perdu\w*|economies|compte|maison)|(?:tout|economies|epargne) perdu\w*|perdu (?:tout(?:es)?|mes economies|mon (?:compte|argent|epargne)|ma maison)|ruine ma vie|vie (?:est )?(?:foutue|finie)|suis (?:ruine|desespere|fini)e?|(?:plus|sans) (?:aucun )?espoir|crible de dettes)\b/,
  /\b(?:(?:lo )?perdi (?:todo|todos|mis ahorros|mi (?:cuenta|dinero|casa|trabajo))|he perdido (?:todo|mis ahorros|mi (?:cuenta|dinero|casa))|(?:lo )?he perdido todo|arruin\w+ mi vida|(?:estoy|me siento) (?:arruinad|desesperad|acabad|hundid)[oa]|sin esperanza|lleno de deudas|endeudad[oa] hasta)\b/,
];

const SCAM = [
  /\b(?:dm|inbox|message|text)\s+(?:me|us|him|her)\b|whats?\s?app|telegram|wa\.me|t\.me\/|signals?\s+(?:group|room|channel)|account\s+manager|recover(?:y|ed|ing)?\s+(?:your|my|all|the|lost)?\s*(?:funds|money|account|capital)|guaranteed\s+(?:profit|returns?)|invest(?:ed)?\s+with\s+(?:me|us|him|her|mr|mrs)\b|\+?\d[\d\s().-]{8,}\d/,
  /\b(?:ecri(?:s|vez)|contacte[rz]?|envoie[rz]?)[- ](?:moi|nous|lui)\b|\ben (?:mp|dm|prive)\b|groupe de signaux|signaux (?:vip|gratuits|payants)|gestionnaire de compte|(?:profits?|gains?|rendements?) garantis?|recuper\w+ (?:vos|votre|mes|mon) (?:fonds|argent)|investi\w* avec (?:moi|nous|lui)/,
  /\b(?:escrib[ea]me|contact[ae]me|manda(?:me)?|hablame) (?:un |al |por )?(?:dm|md|privado|mensaje|interno|whats?\s?app)?\b(?=.*\b(?:dm|md|privado|interno|ganar|ganancias|senales|invertir)\b)|al (?:dm|md|privado|interno)\b|grupo de senales|senales (?:vip|gratis)|gestor de cuentas?|ganancias? garantizadas?|recuper\w+ (?:tu|su|mi|mis) (?:dinero|fondos)|invert\w+ con(?:migo| nosotros)/,
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();

/** An account name made to look like ours: "zenlot_support", "zen1ot.app", "z3nlot". */
function looksLikeUs(username: string): boolean {
  const u = username.toLowerCase();
  if (u === 'zenlot_app') return false;
  return u.replace(/[._-]/g, '').replace(/0/g, 'o').replace(/[1|!]/g, 'l').replace(/3/g, 'e').includes('zenlot');
}

const any = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

/** Deterministic red flags, checked before (and regardless of) the model. Distress outranks scam: a person comes first. */
export function redFlags(username: string, text: string): CommentCategory | null {
  if (looksLikeUs(username)) return 'impersonation';
  const t = plain(text);
  if (any(DISTRESS, t)) return 'distress';
  return any(SCAM, t) ? 'scam' : null;
}

/** Distress wording that also looks like scam bait ("I lost everything until Mr X recovered my funds"). */
export function alsoLooksLikeScam(text: string): boolean {
  return any(SCAM, plain(text));
}
