import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { ZENLOT_PRODUCT } from '../config/zenlot';
import { lintCopy } from '../content/brand-guard';
import { COMMENT_CATEGORIES, PLAYBOOK, URGENT, redFlags, type CommentCategory } from '../content/community-playbook';
import { emailService } from '../services/email.service';
import { complete } from '../services/llm-providers';
import { instagramService, type IgComment } from '../services/social/instagram.service';
import { CALENDAR_DIR } from '../instagram/calendar';
import { esc } from '../instagram/preview';

// ---------------------------------------------------------------------------
// Comment digest. Collects new comments on recent posts, sorts them by the
// playbook (src/content/community-playbook.ts), drafts a reply for each and
// emails one digest. Nothing is ever posted, hidden or deleted automatically.
//
//   npm run ig:comments                 # email new comments (DRY_RUN writes out/instagram/comments-*.html)
//   npm run ig:comments -- --all        # include comments already sent before
//
// Seen comment ids live in content/instagram/comments-state.json (committed by
// the workflow), so each comment is emailed once.
// ---------------------------------------------------------------------------

const RECENT_POSTS = 10;
const STATE_FILE = path.join(path.dirname(CALENDAR_DIR), 'comments-state.json');
const OWN = (env.IG_HANDLE || '@zenlot_app').replace(/^@/, '').toLowerCase();

interface State {
  seen: Record<string, string>; // comment id → first emailed at
}

interface Item {
  comment: IgComment;
  post: { id: string; permalink?: string; caption?: string };
  answered: boolean; // we already replied in the thread
  category: CommentCategory;
  urgent: boolean;
  action: 'reply' | 'hide' | 'report' | 'none';
  reply: string;
  note: string;
  lint: string[];
}

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return { seen: {} };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State;
}

function saveState(state: State) {
  // Forget ids after 60 days so the file stays small.
  const cutoff = Date.now() - 60 * 86400_000;
  for (const [id, at] of Object.entries(state.seen)) if (Date.parse(at) < cutoff) delete state.seen[id];
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

const DEFAULT_REPLY: Partial<Record<CommentCategory, string>> = {
  impersonation: `Heads up: our only account is @${OWN}. We never DM anyone for money, deposits or "signals". Please report accounts copying us.`,
  scam: `Reminder: Zenlot never DMs anyone for money, deposits or "signals". Our only account is @${OWN}.`,
};

/** Asks the model to sort and draft replies for a batch of comments. Returns [] if every provider fails. */
async function triage(items: Item[]): Promise<Array<{ i: number; category: CommentCategory; action: Item['action']; reply: string; note: string }>> {
  if (!items.length) return [];
  const list = items
    .map((it, i) => `#${i} on post "${(it.post.caption ?? '').split('\n')[0].slice(0, 90)}"\n@${it.comment.username}: ${it.comment.text}${it.category !== 'other' ? `\n(pre-flagged: ${it.category})` : ''}`)
    .join('\n\n');
  const prompt = `You help run the Instagram account @${OWN} for Zenlot.
${ZENLOT_PRODUCT}

# Reply playbook
${PLAYBOOK}

# New comments
${list}

For each comment, pick a category from: ${COMMENT_CATEGORIES.join(', ')}.
Keep any pre-flagged category. Pick an action: reply, hide, report (impersonation) or none.
Draft the reply text following the playbook ("" when action is none or hide). Add a short note for the owner
(why, or what to check). Return ONLY a JSON array:
[{"i": 0, "category": "...", "action": "reply", "reply": "...", "note": "..."}]`;
  try {
    const text = await complete('triageComments', prompt, { maxTokens: 3000, tier: 'complex', json: true });
    const raw = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as Array<{ i: number; category: string; action: string; reply: string; note: string }>;
    return raw
      .filter((r) => Number.isInteger(r.i) && items[r.i])
      .map((r) => ({
        i: r.i,
        category: (COMMENT_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as CommentCategory) : 'other',
        action: (['reply', 'hide', 'report', 'none'].includes(r.action) ? r.action : 'reply') as Item['action'],
        reply: String(r.reply ?? '').trim(),
        note: String(r.note ?? '').trim(),
      }));
  } catch (err) {
    console.warn(`[Comments] drafting failed, sending comments without drafts: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function itemHtml(it: Item): string {
  const when = `${new Date(it.comment.timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const action = { reply: 'Reply', hide: 'Hide the comment', report: 'Report the account, then reply', none: 'No reply needed' }[it.action];
  const lint = it.lint.length ? `<div style="color:#991b1b;font-size:12px">Draft fails the brand check: ${it.lint.map(esc).join('; ')}. Rewrite before posting.</div>` : '';
  const draft = it.reply
    ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:8px 10px;margin-top:6px;font-size:14px"><b>Suggested reply:</b> ${esc(it.reply)}</div>${lint}`
    : '';
  return `<div style="margin:14px 0;padding:12px;border:1px solid ${it.urgent ? '#fca5a5' : '#e5e7eb'};border-radius:8px">
<div style="font-size:12px;color:#667">${esc(it.category)} · ${action}${it.answered ? ' · we already replied in this thread' : ''} · ${when} · <a href="${it.post.permalink ?? '#'}">open post</a></div>
<div style="font-size:15px;margin-top:4px"><b>@${esc(it.comment.username)}</b>: ${esc(it.comment.text)}</div>
${it.note ? `<div style="font-size:13px;color:#445;margin-top:4px">${esc(it.note)}</div>` : ''}${draft}</div>`;
}

async function main() {
  const all = process.argv.includes('--all');
  console.log(`💬 Instagram comments${env.DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (!instagramService.configured) {
    console.log('Instagram not configured — nothing to do');
    return;
  }

  const state = loadState();
  const media = await instagramService.listRecentMedia(RECENT_POSTS);
  const items: Item[] = [];
  for (const post of media) {
    const comments = await instagramService.getComments(post.id);
    for (const c of comments) {
      if (c.username.toLowerCase() === OWN) continue;
      if (!all && state.seen[c.id]) continue;
      const answered = (c.replies?.data ?? []).some((r) => r.username.toLowerCase() === OWN);
      const flag = redFlags(c.username, c.text);
      items.push({ comment: c, post, answered, category: flag ?? 'other', urgent: Boolean(flag), action: flag === 'impersonation' ? 'report' : flag === 'scam' ? 'hide' : 'reply', reply: '', note: '', lint: [] });
    }
  }
  console.log(`${items.length} new comment(s) on ${media.length} recent post(s)`);
  if (!items.length) return;

  for (const d of await triage(items)) {
    const it = items[d.i];
    // The deterministic red flags win over the model's category.
    // The deterministic red flags (impersonation → report, scam → hide) also keep their action.
    if (!it.urgent) {
      it.category = d.category;
      it.action = d.action;
    }
    it.reply = d.reply;
    it.note = d.note;
  }
  for (const it of items) {
    it.urgent = URGENT.includes(it.category);
    if (!it.reply && DEFAULT_REPLY[it.category]) it.reply = DEFAULT_REPLY[it.category]!;
    it.lint = it.reply ? lintCopy(it.reply) : [];
  }

  items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Date.parse(a.comment.timestamp) - Date.parse(b.comment.timestamp));
  const urgent = items.filter((i) => i.urgent).length;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:720px;color:#111">
<h2 style="margin-bottom:4px">${items.length} new comment${items.length > 1 ? 's' : ''} on @${OWN}</h2>
<p style="margin-top:0;color:#445;font-size:14px">Nothing has been posted. Reply, hide or report in the Instagram app. Rules: docs/COMMUNITY.md.</p>
${items.map(itemHtml).join('\n')}</div>`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await emailService.sendHtml(
    `[Zenlot IG] ${urgent ? `⚠️ ${urgent} urgent · ` : ''}${items.length} new comment${items.length > 1 ? 's' : ''}`,
    html,
    [],
    path.join('out', 'instagram', `comments-${stamp}.html`),
  );

  // Only mark comments as seen once a real email went out, so dry runs never swallow them.
  if (!env.DRY_RUN) {
    const now = new Date().toISOString();
    for (const it of items) state.seen[it.comment.id] ??= now;
    saveState(state);
  }
  console.log(`✅ Digest ${env.DRY_RUN ? 'written' : 'sent'}: ${items.length} comment(s), ${urgent} urgent`);
}

main().catch((err) => {
  console.error('❌ Comment digest failed:', err);
  process.exit(1);
});
