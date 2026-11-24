import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redFlags } from '../src/content/community-playbook';
import { skipWhileAway, AWAY_REASON } from '../src/instagram/away';
import { buildItems, digest, parseTriage } from '../src/instagram/digest';
import type { Heard, Inbound } from '../src/instagram/listening';
import type { CalendarPost } from '../src/instagram/types';

const DISTRESS = [
  'I lost everything.', 'I’ve lost all my savings and I can’t go on', 'i just blew my whole account, feeling hopeless', 'honestly I want to die', 'thinking about suicide',
  "I don't want to live anymore", 'I gambled away my rent', 'drowning in debt',
  'J’ai tout perdu', "j'ai perdu mon compte et j’en peux plus", 'je n’en peux plus', 'envie de mourir', 'Je suis désespérée', 'ma vie est foutue',
  'Lo perdí todo', 'he perdido todos mis ahorros... lo he perdido todo', 'perdí mi cuenta', 'no puedo más', 'quiero morirme', 'estoy desesperado', 'ganas de morir',
];
const SCAM = [
  'DM me for guaranteed profit', 'join my WhatsApp', 'best signals group t.me/x', 'Mrs Ann recovered my funds', 'call +1 (555) 123-4567',
  'Écrivez-moi en privé', 'groupe de signaux VIP gratuit', 'gains garantis', 'contactez moi en DM',
  'Escríbeme al privado para ganar', 'grupo de señales gratis', 'ganancias garantizadas', 'recuperé mi dinero con ella', 'mándame un DM',
];
const FINE = [
  'Great post, saving this', 'How do you size a trade with a 25 pip stop?', 'A losing streak is normal', 'What if you lose everything on one trade?', 'Does it work in French?',
  'Merci, très utile', 'Comment calculer le risque ?', 'Gracias, muy útil', '¿Está disponible en español?', 'I never trade without a plan', 'Risk 1% per trade', 'perdre fait partie du jeu',
];

test('distress is caught in EN, FR and ES', () => {
  for (const t of DISTRESS) assert.equal(redFlags('someone', t), 'distress', t);
});
test('scam is caught in EN, FR and ES', () => {
  for (const t of SCAM) assert.equal(redFlags('someone', t), 'scam', t);
});
test('ordinary comments are not flagged', () => {
  for (const t of FINE) assert.equal(redFlags('someone', t), null, t);
});
test('lookalike names are impersonation; ours is not', () => {
  for (const u of ['zenlot_support', 'Zen.Lot', 'zen1ot', 'z3nl0t_app', 'zenlot_app_']) assert.equal(redFlags(u, 'hi'), 'impersonation', u);
  assert.equal(redFlags('zenlot_app', 'hi'), null);
});
test('distress outranks scam wording', () => assert.equal(redFlags('x', 'I lost everything, please dm me'), 'distress'));

const inbound = (text: string, username = 'someone', id = text): Inbound => ({
  comment: { id, text, username, timestamp: '2026-11-24T10:00:00+0000' }, post: { id: 'p' }, answered: false, flag: redFlags(username, text),
});
const heard = (items: Inbound[], extra: Partial<Heard> = {}): Heard => ({ items, tags: [], gaps: [], next: { seen: {} }, postsChecked: 1, ...extra });

test('AC-12: with every model down, flagged comments are urgent and all others unreviewed, never "other"', () => {
  const h = heard([...FINE, ...DISTRESS, ...SCAM].map((t) => inbound(t)).concat(inbound('hi', 'zenlot_help')));
  const items = buildItems(h, []);
  assert.equal(items.filter((i) => i.urgent).length, DISTRESS.length + SCAM.length + 1);
  assert.equal(items.filter((i) => i.unreviewed).length, FINE.length);
  assert.ok(items.slice(0, DISTRESS.length).every((i) => i.category === 'distress' && i.action === 'reply' && i.note));
  const { html, subject, unreviewed } = digest(h, items);
  assert.equal(unreviewed, FINE.length);
  assert.match(subject, /urgent · .*unreviewed/);
  assert.doesNotMatch(html, />other ·/);
});

test('a comment the model skipped is unreviewed; the model cannot downgrade a flag or hide distress', () => {
  const h = heard([inbound('nice'), inbound('I lost everything'), inbound('skipped')]);
  const t = parseTriage('{"comments":[{"i":0,"category":"praise","action":"reply","reply":"Thanks!","note":""},{"i":1,"category":"spam","action":"hide","reply":"Try Zenlot","note":""},{"i":9,"category":"praise"},{"i":2,"category":"made-up"}]}', 3);
  const by = Object.fromEntries(buildItems(h, t).map((i) => [i.comment.text, i]));
  assert.equal(by.nice.unreviewed, false);
  assert.equal(by.skipped.unreviewed, true);
  assert.deepEqual([by['I lost everything'].category, by['I lost everything'].action, by['I lost everything'].reply], ['distress', 'reply', '']);
});

test('other people’s text is escaped and gaps are shown', () => {
  const h = heard([inbound('<img src=x onerror=1>')], { gaps: ['tags could not be read'] });
  const { html } = digest(h, buildItems(h, []));
  assert.ok(!html.includes('<img'));
  assert.match(html, /Incomplete: tags could not be read/);
});

test('AC-13: while away, only posts that are due are skipped', () => {
  const now = new Date('2026-11-24T13:07:00Z');
  const post = (scheduledAt: string, status = 'scheduled') => ({ scheduledAt, status }) as CalendarPost;
  const due = post('2026-11-24T13:00:00Z');
  assert.equal(skipWhileAway(due, now, true), true);
  assert.deepEqual([due.status, due.held], ['skipped', [AWAY_REASON]]);
  const untouched = [[post('2026-11-25T13:00:00Z'), true], [post('2026-11-24T13:00:00Z'), false], [post('2026-11-24T13:00:00Z', 'published'), true], [post('nonsense'), true]] as const;
  for (const [p, away] of untouched) assert.equal(skipWhileAway(p, now, away), false);
});
