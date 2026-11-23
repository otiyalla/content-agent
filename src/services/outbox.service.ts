import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { lintCopy, lintReply } from '../content/brand-guard';
import { emailService } from './email.service';

// ---------------------------------------------------------------------------
// Outbox: the approval gate for X and Reddit.
//
// Every outbound post or reply passes through allow().
//   - Replies to other people's posts are NEVER posted automatically. X bans
//     automated replies to keyword searches, and replies are where tone and
//     disclosure matter most. They always wait for a person.
//   - Original posts may go out automatically only when AGENTS_AUTOPOST=true
//     and the brand check finds nothing.
//   - Posts get a "Not financial advice" line if they don't have one.
//
// Held drafts are saved to a queue (save()). Once a day the digest job
// (src/workflows/outbox-digest.ts) emails the best few, with the original post
// quoted so each one can be judged without clicking through, then clears it.
// ---------------------------------------------------------------------------

export const DIGEST_CAP = 5;
const MAX_AGE_MS = 48 * 3600_000; // a reply to a 2-day-old thread is stale
const X_LIMIT = 280;
const NFA = 'Not financial advice.';

export interface OutboundDraft {
  platform: 'x' | 'reddit';
  kind: 'post' | 'reply';
  action: string; // e.g. "new tweet", "reply to tweet 123", "new post in r/Forex"
  text: string;
  title?: string;
  link?: string; // where to post it by hand
  context?: string; // the post being replied to, quoted in the digest
  score?: number; // how worthwhile the workflow rated it (1-10)
}

export interface QueuedDraft extends OutboundDraft {
  issues: string[];
  workflow: string;
  heldAt: string;
}

// Live runs keep the queue in the repo (the workflow commits it between runs); dry runs keep it local.
export const QUEUE_FILE = env.DRY_RUN ? path.join('out', 'outbox', 'queue.json') : path.join('content', 'outbox', 'queue.json');

export function loadQueue(): QueuedDraft[] {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) as QueuedDraft[];
}

export function saveQueue(queue: QueuedDraft[]): void {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, `${JSON.stringify(queue, null, 2)}\n`);
}

/** Adds the disclaimer to original posts that lack one, if it fits. */
function withDisclaimer(d: OutboundDraft): { text: string; issue?: string } {
  if (d.kind !== 'post' || /not financial advice/i.test(d.text)) return { text: d.text };
  if (d.platform === 'reddit') return { text: `${d.text.trim()}\n\n*${NFA}*` };
  const isThread = d.text.includes('🧵') || /\n\s*\d+[/.)]/.test(d.text);
  const added = `${d.text.trim()}\n\n${NFA}`;
  if (isThread || added.length <= X_LIMIT) return { text: added };
  return { text: d.text, issue: `no room for "${NFA}" within ${X_LIMIT} characters; shorten it` };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class OutboxService {
  private held: QueuedDraft[] = [];

  /**
   * Returns the text to post if this draft may go out now (possibly with a
   * disclaimer added), or null if it's held for the daily digest.
   */
  allow(draft: OutboundDraft): string | null {
    const { text, issue } = withDisclaimer(draft);
    const issues = [...lintCopy(`${draft.title ?? ''}\n${text}`), ...(draft.kind === 'reply' ? lintReply(text) : []), ...(issue ? [issue] : [])];

    if (draft.kind === 'post' && env.AGENTS_AUTOPOST && issues.length === 0) return text;

    this.held.push({ ...draft, text, issues, workflow: '', heldAt: new Date().toISOString() });
    const reason = issues.length
      ? `brand check: ${issues.join('; ')}`
      : draft.kind === 'reply'
        ? 'replies always wait for a person'
        : 'waiting for approval (AGENTS_AUTOPOST is off)';
    console.log(`📥 [Outbox] Held ${draft.platform} ${draft.action} — ${reason}`);
    return null;
  }

  /** Adds this run's held drafts to the queue for the daily digest. Safe to call more than once. */
  save(workflow: string): void {
    if (!this.held.length) return;
    const queue = loadQueue();
    const known = new Set(queue.map((q) => `${q.link ?? ''}|${q.text}`));
    for (const d of this.held) {
      const key = `${d.link ?? ''}|${d.text}`;
      if (!known.has(key)) queue.push({ ...d, workflow });
      known.add(key);
    }
    saveQueue(queue);
    console.log(`📥 [Outbox] ${this.held.length} draft(s) queued for the daily digest (${queue.length} waiting)`);
    this.held = [];
  }

  /**
   * Emails the best DIGEST_CAP drafts from the queue and clears it. Clean drafts
   * rank above ones that failed the brand check; then by score, newest first.
   */
  async sendDigest(now: Date = new Date()): Promise<{ sent: number; dropped: number }> {
    const queue = loadQueue();
    const fresh = queue.filter((d) => now.getTime() - Date.parse(d.heldAt) <= MAX_AGE_MS);
    if (!fresh.length) {
      if (queue.length) saveQueue([]);
      console.log(`[Outbox] Nothing to send${queue.length ? ` (${queue.length} stale draft(s) dropped)` : ''}`);
      return { sent: 0, dropped: queue.length };
    }
    fresh.sort(
      (a, b) =>
        Number(a.issues.length > 0) - Number(b.issues.length > 0) ||
        (b.score ?? 5) - (a.score ?? 5) ||
        Date.parse(b.heldAt) - Date.parse(a.heldAt),
    );
    const picked = fresh.slice(0, DIGEST_CAP);
    const dropped = queue.length - picked.length;

    const items = picked
      .map(
        (d) => `<div style="margin:18px 0;padding:14px;border:1px solid ${d.issues.length ? '#fca5a5' : '#e5e7eb'};border-radius:8px">
<div style="font-size:13px;color:#556"><b>${d.platform === 'x' ? 'X' : 'Reddit'}</b> · ${esc(d.action)}${d.score !== undefined ? ` · score ${d.score}/10` : ''}${d.link ? ` · <a href="${esc(d.link)}">open</a>` : ''}</div>
${d.context ? `<blockquote style="margin:10px 0;padding:8px 12px;border-left:3px solid #cbd5e1;color:#445;font-size:13px;white-space:pre-wrap">${esc(d.context.slice(0, 600))}${d.context.length > 600 ? '…' : ''}</blockquote>` : ''}
${d.issues.length ? `<div style="color:#b91c1c;font-size:13px;margin-top:6px"><b>Do not post as written:</b> ${d.issues.map(esc).join('; ')}</div>` : ''}
${d.title ? `<h3 style="margin:10px 0 4px">${esc(d.title)}</h3>` : ''}
<pre style="white-space:pre-wrap;font-family:inherit;background:#f0fdfa;padding:10px;border-radius:6px;font-size:14px">${esc(d.text)}</pre></div>`,
      )
      .join('\n');

    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:760px;color:#111">
<h2 style="margin-bottom:4px">Today's ${picked.length} best X/Reddit draft${picked.length > 1 ? 's' : ''}</h2>
<p style="margin-top:0;color:#445">Nothing here was posted. Post the ones you like yourself, editing as needed.
${dropped ? `${dropped} other draft(s) were skipped to keep this short.` : ''}</p>
${items}</div>`;

    const ok = await emailService.sendHtml(
      `[Zenlot X/Reddit] ${picked.length} draft${picked.length > 1 ? 's' : ''} to review`,
      html,
      [],
      path.join('out', 'outbox', `digest-${now.toISOString().slice(0, 10)}.html`),
    );
    if (!ok) throw new Error('digest email was not sent; queue kept for the next run');
    saveQueue([]);
    return { sent: picked.length, dropped };
  }
}

export const outbox = new OutboxService();
