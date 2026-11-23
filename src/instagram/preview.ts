import { postAltTexts } from './alt-text';
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
