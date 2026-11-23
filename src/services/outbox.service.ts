import path from 'path';
import { env } from '../config/env';
import { lintCopy } from '../content/brand-guard';
import { emailService } from './email.service';

// ---------------------------------------------------------------------------
// Outbox: the approval gate for X and Reddit.
//
// Every outbound post or reply passes through allow(). It may go out only when
// AGENTS_AUTOPOST=true AND the brand guard finds nothing. Everything else is
// held, and flush() emails the held drafts as one digest so the owner can post
// the good ones by hand. With AGENTS_AUTOPOST unset (the default) nothing is
// posted automatically on X or Reddit.
// ---------------------------------------------------------------------------

export interface OutboundDraft {
  platform: 'x' | 'reddit';
  action: string; // e.g. "tweet", "reply to tweet 123", "new post in r/Forex"
  text: string;
  title?: string;
  link?: string; // where to post it by hand
}

interface HeldDraft extends OutboundDraft {
  issues: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class OutboxService {
  private held: HeldDraft[] = [];

  /** True if the draft may be posted now; otherwise it is held for the digest. */
  allow(draft: OutboundDraft): boolean {
    const issues = lintCopy(`${draft.title ?? ''}\n${draft.text}`);
    if (env.AGENTS_AUTOPOST && issues.length === 0) return true;

    this.held.push({ ...draft, issues });
    const reason = issues.length ? `brand check: ${issues.join('; ')}` : 'waiting for approval (AGENTS_AUTOPOST is off)';
    console.log(`📥 [Outbox] Held ${draft.platform} ${draft.action} — ${reason}`);
    return false;
  }

  /** Emails all held drafts (or writes a local preview in dry-run). */
  async flush(workflow: string): Promise<void> {
    if (!this.held.length) return;
    const drafts = this.held;
    this.held = [];

    const blocked = drafts.filter((d) => d.issues.length).length;
    const items = drafts
      .map(
        (d) => `<div style="margin:20px 0;padding:14px;border:1px solid ${d.issues.length ? '#fca5a5' : '#e5e7eb'};border-radius:8px">
<div style="font-size:13px;color:#556"><b>${d.platform === 'x' ? 'X' : 'Reddit'}</b> · ${esc(d.action)}${d.link ? ` · <a href="${esc(d.link)}">open</a>` : ''}</div>
${d.issues.length ? `<div style="color:#b91c1c;font-size:13px;margin-top:6px"><b>Do not post as written:</b> ${d.issues.map(esc).join('; ')}</div>` : ''}
${d.title ? `<h3 style="margin:10px 0 4px">${esc(d.title)}</h3>` : ''}
<pre style="white-space:pre-wrap;font-family:inherit;background:#f8fafc;padding:10px;border-radius:6px;font-size:14px">${esc(d.text)}</pre></div>`,
      )
      .join('\n');

    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:760px;color:#111">
<h2 style="margin-bottom:4px">${drafts.length} draft(s) from ${esc(workflow)}</h2>
<p style="margin-top:0;color:#445">Nothing here was posted. Copy the ones you like and post them yourself.${blocked ? ` ${blocked} failed the brand check and should be rewritten first.` : ''}</p>
${items}</div>`;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    await emailService.sendHtml(
      `[Zenlot ${workflow}] ${drafts.length} draft(s) to review${blocked ? `, ${blocked} blocked` : ''}`,
      html,
      [],
      path.join('out', 'outbox', `${workflow}-${stamp}.html`),
    );
  }
}

export const outbox = new OutboxService();
