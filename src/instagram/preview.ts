import path from 'path';
import { emailService } from '../services/email.service';
import { postAltTexts } from './alt-text';
import { qaPost } from './qa';
import { renderPost } from './renderer';
import type { CalendarPost } from './types';

// HTML for one post in a review email (the Sunday plan and change notices).

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type Attachment = { filename: string; content: Buffer; cid: string };

export function postSectionHtml(
  post: CalendarPost,
  images: Buffer[],
  attachments: Attachment[],
  blocking: string[],
  cidPrefix = post.id,
): string {
  const alts = postAltTexts(post);
  const imgs = images
    .map((content, i) => {
      const cid = `${cidPrefix}-${i + 1}`;
      attachments.push({ filename: `${cid}.jpg`, content, cid });
      return `<img src="cid:${cid}" width="180" style="border-radius:8px;margin:0 6px 6px 0" alt="${esc(alts[i] ?? `slide ${i + 1}`)}">`;
    })
    .join('');
  const when = new Date(post.scheduledAt).toUTCString().replace(':00 GMT', ' UTC');
  const qaHtml = blocking.length
    ? `<div style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:8px 10px;border-radius:6px;font-size:13px;margin-bottom:8px"><b>Won't publish until fixed:</b> ${blocking.map(esc).join('; ')}</div>`
    : '';
  return `<div style="margin:28px 0;padding-top:16px;border-top:1px solid #e5e7eb">
<h3 style="margin:0 0 4px">${when} — ${esc(post.topic)}</h3>${qaHtml}
<div style="color:#667;font-size:13px;margin-bottom:10px">${post.pillar} · ${post.slides.length > 1 ? `carousel, ${post.slides.length} slides` : post.slides[0].layout} · id <code>${post.id}</code></div>
<div>${imgs}</div>
<pre style="white-space:pre-wrap;font-family:inherit;background:#f8fafc;padding:12px;border-radius:8px;font-size:14px">${esc(post.caption)}

${post.hashtags.map((t) => `#${t}`).join(' ')}</pre>
<div style="color:#667;font-size:12px"><b>Why:</b> ${esc(post.rationale)}</div></div>`;
}

export function editLink(week: string): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!server || !repo) return null;
  return `${server}/${repo}/edit/${process.env.GITHUB_REF_NAME || 'main'}/content/instagram/calendar/${week}.json`;
}

/** Link to a file in the repository, when running on GitHub. */
export function repoLink(file: string): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  return server && repo ? `${server}/${repo}/blob/${process.env.GITHUB_REF_NAME || 'main'}/${file}` : null;
}

/** Emails a preview of a post that changed after the last preview, or was never previewed. Throws if the email couldn't be sent. */
export async function sendChangePreview(week: string, post: CalendarPost, publishAfter: Date, reason = 'it changed since the last preview'): Promise<void> {
  const images = await renderPost(post.slides);
  const qa = await qaPost(post);
  const attachments: Attachment[] = [];
  const section = postSectionHtml(post, images, attachments, qa.blocking);
  const after = publishAfter.toUTCString().replace(':00 GMT', ' UTC');
  const edit = editLink(week);
  const first = !post.previewHash;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:900px;color:#111">
<h2 style="margin-bottom:4px">${first ? 'First preview of a scheduled Instagram post' : 'A scheduled Instagram post changed'}</h2>
<p style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:8px;font-size:14px">
<code>${esc(post.id)}</code> needs a fresh look: ${esc(reason)}. This is exactly what will be published,
at its scheduled time or the first run after <b>${esc(after)}</b>, whichever is later. To stop it, set its <code>"status"</code> to <code>"skipped"</code>
${edit ? `in <a href="${edit}">the calendar file</a>` : `in <code>content/instagram/calendar/${week}.json</code>`}.</p>
${section}</div>`;
  const ok = await emailService.sendHtml(
    `[Zenlot IG] ${first ? 'First preview' : 'Changed after preview'}: ${post.id} publishes after ${after}`,
    html,
    attachments,
    path.join('out', 'instagram', week, `changed-${post.id}.html`),
  );
  // A preview nobody received doesn't count: callers must not mark the post as previewed.
  if (!ok) throw new Error(`preview email for ${post.id} was not sent`);
}

/** Tells the team a post didn't go out, and why. Returns false if the email failed. */
export async function sendMissedNotice(week: string, post: CalendarPost, reason: string): Promise<boolean> {
  return emailService.sendHtml(
    `[Zenlot IG] Not published: ${post.id}`,
    `<p><code>${esc(post.id)}</code> (${esc(post.topic)}) was not published: ${esc(reason)}.</p>
<p>To use it later, fix the cause, change its <code>"scheduledAt"</code> and set its <code>"status"</code> to <code>"scheduled"</code> in <code>content/instagram/calendar/${week}.json</code>.</p>`,
    [],
    path.join('out', 'instagram', week, `missed-${post.id}.html`),
  );
}
