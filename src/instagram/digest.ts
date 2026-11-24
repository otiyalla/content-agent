import { alsoLooksLikeScam, COMMENT_CATEGORIES, type CommentCategory } from '../content/community-playbook';
import { lintCopy } from '../content/brand-guard';
import { extractList } from '../services/json';
import { esc } from './preview';
import { isUrgent, OWN, type Heard, type Inbound } from './listening';

// ---------------------------------------------------------------------------
// Turns what was heard into the digest. Order: urgent, then anything no model
// could sort ("unreviewed"), then people who tagged or commented.
// ---------------------------------------------------------------------------

export type Action = 'reply' | 'hide' | 'report' | 'none';

export interface Item extends Inbound {
  category: CommentCategory;
  urgent: boolean;
  /** No model sorted this one, so a person must. */
  unreviewed: boolean;
  action: Action;
  reply: string;
  note: string;
  lint: string[];
}

export interface Triage {
  i: number;
  category: CommentCategory;
  action: Action;
  reply: string;
  note: string;
}

const FLAG_ACTION: Partial<Record<CommentCategory, Action>> = { impersonation: 'report', scam: 'hide', distress: 'reply' };

const DEFAULT_REPLY: Partial<Record<CommentCategory, string>> = {
  impersonation: `Heads up: our only account is @${OWN}. We never DM anyone for money, deposits or "signals". Please report accounts copying us.`,
  scam: `Reminder: Zenlot never DMs anyone for money, deposits or "signals". Our only account is @${OWN}.`,
};

/** Reads the model's answer. Anything malformed is dropped, which leaves that comment unreviewed. */
export function parseTriage(text: string, count: number): Triage[] {
  type Raw = { i: number; category?: unknown; action?: unknown; reply?: unknown; note?: unknown };
  const isRaw = (v: unknown): v is Raw => Number.isInteger((v as Raw | null)?.i);
  return extractList(text, 'comments', isRaw)
    .filter((r) => r.i >= 0 && r.i < count && (COMMENT_CATEGORIES as readonly unknown[]).includes(r.category))
    .map((r) => ({
      i: r.i,
      category: r.category as CommentCategory,
      action: (['reply', 'hide', 'report', 'none'].includes(String(r.action)) ? r.action : 'reply') as Action,
      reply: String(r.reply ?? '').trim(),
      note: String(r.note ?? '').trim(),
    }));
}

/** Combines the deterministic flags with the model's answer. The flags always win. */
export function buildItems(heard: Pick<Heard, 'items'>, triage: Triage[]): Item[] {
  const items = heard.items.map((h, i): Item => {
    const t = triage.find((x) => x.i === i);
    const category = h.flag ?? t?.category ?? 'other';
    let reply = t?.reply ?? '';
    if (!reply && DEFAULT_REPLY[category]) reply = DEFAULT_REPLY[category]!;
    let note = t?.note ?? '';
    if (h.flag === 'distress') {
      note = `${alsoLooksLikeScam(h.comment.text) ? 'This also looks like scam bait: check the account before replying. ' : ''}${note || 'Reply with care first (docs/COMMUNITY.md). If they may be in danger, see docs/INCIDENTS.md.'}`;
      // Never hide a person in distress on a model's say-so, and never show a draft that sells.
      if (/zenlot/i.test(reply)) reply = '';
    }
    return {
      ...h,
      category,
      urgent: isUrgent(category),
      unreviewed: !h.flag && !t,
      action: h.flag ? (FLAG_ACTION[h.flag] ?? 'reply') : t ? (t.category === 'distress' ? 'reply' : t.action) : 'none',
      reply,
      note,
      lint: reply ? lintCopy(reply) : [],
    };
  });
  const rank = (i: Item) => (i.urgent ? (i.category === 'distress' ? 0 : 1) : i.unreviewed ? 2 : 3);
  return items.sort((a, b) => rank(a) - rank(b) || Date.parse(a.comment.timestamp) - Date.parse(b.comment.timestamp));
}

function itemHtml(it: Item): string {
  const when = `${new Date(it.comment.timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const action = it.unreviewed ? 'Not sorted: read it yourself' : { reply: 'Reply', hide: 'Hide the comment', report: 'Report the account, then reply', none: 'No reply needed' }[it.action];
  const lint = it.lint.length ? `<div style="color:#991b1b;font-size:12px">Draft fails the brand check: ${it.lint.map(esc).join('; ')}. Rewrite before posting.</div>` : '';
  const draft = it.reply
    ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:8px 10px;margin-top:6px;font-size:14px"><b>Suggested reply:</b> ${esc(it.reply)}</div>${lint}`
    : '';
  const border = it.urgent ? '#fca5a5' : it.unreviewed ? '#fde68a' : '#e5e7eb';
  return `<div style="margin:14px 0;padding:12px;border:1px solid ${border};border-radius:8px">
<div style="font-size:12px;color:#667">${it.unreviewed ? 'unreviewed' : esc(it.category)} · ${action}${it.answered ? ' · we already replied in this thread' : ''} · ${when} · <a href="${esc(it.post.permalink ?? '#')}">open post</a></div>
<div style="font-size:15px;margin-top:4px"><b>@${esc(it.comment.username)}</b>${it.threadOf ? ` <span style="color:#667;font-size:12px">(in @${esc(it.threadOf)}'s thread)</span>` : ''}: ${esc(it.comment.text ?? '')}</div>
${it.note ? `<div style="font-size:13px;color:#445;margin-top:4px">${esc(it.note)}</div>` : ''}${draft}</div>`;
}

function tagHtml({ tag, flag }: Heard['tags'][number]): string {
  const caption = tag.caption ?? '';
  return `<div style="margin:14px 0;padding:12px;border:1px solid ${isUrgent(flag) ? '#fca5a5' : '#bfdbfe'};border-radius:8px">
<div style="font-size:12px;color:#667">tagged us${flag ? ` · looks like ${esc(flag)}` : ''} · ${esc(tag.timestamp.slice(0, 10))} · <a href="${esc(tag.permalink ?? '#')}">open post</a></div>
<div style="font-size:15px;margin-top:4px"><b>@${esc(tag.username ?? 'unknown')}</b>: ${esc(caption.slice(0, 240))}${caption.length > 240 ? '…' : ''}</div></div>`;
}

export function digest(heard: Heard, items: Item[], warnings: string[] = []): { subject: string; html: string; urgent: number; unreviewed: number } {
  const urgentTags = heard.tags.filter((t) => isUrgent(t.flag));
  const otherTags = heard.tags.filter((t) => !isUrgent(t.flag));
  const urgent = items.filter((i) => i.urgent).length + urgentTags.length;
  const unreviewed = items.filter((i) => i.unreviewed && !i.urgent).length;
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;
  const what = [items.length ? n(items.length, 'new comment') : '', heard.tags.length ? n(heard.tags.length, 'new tag') : ''].filter(Boolean).join(', ') || 'Comments not fully read';
  const notices = [...warnings, ...heard.gaps.map((g) => `Incomplete: ${g}.`)];
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:720px;color:#111">
<h2 style="margin-bottom:4px">${what} · @${OWN}</h2>
<p style="margin-top:0;color:#445;font-size:14px">Nothing has been posted. Reply, hide or report in the Instagram app. Rules: docs/COMMUNITY.md.</p>
${notices.length ? `<div style="background:#fffbeb;border:1px solid #fde68a;padding:10px 12px;border-radius:8px;font-size:14px">${notices.map(esc).join('<br>')}</div>` : ''}
${[...items.filter((i) => i.urgent).map(itemHtml), ...urgentTags.map(tagHtml), ...items.filter((i) => !i.urgent && i.unreviewed).map(itemHtml), ...otherTags.map(tagHtml), ...items.filter((i) => !i.urgent && !i.unreviewed).map(itemHtml)].join('\n')}</div>`;
  const subject = `[Zenlot IG] ${urgent ? `⚠️ ${urgent} urgent · ` : ''}${unreviewed ? `${unreviewed} unreviewed · ` : ''}${what}`;
  return { subject, html, urgent, unreviewed };
}
