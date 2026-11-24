import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { redFlags, URGENT, type CommentCategory } from '../content/community-playbook';
import { instagramService, type IgMedia, type IgReply, type IgTag, type InstagramService } from '../services/social/instagram.service';
import { CALENDAR_DIR } from './calendar';

// ---------------------------------------------------------------------------
// Listening: who has commented on, replied under or tagged @zenlot_app.
//
// Once a day every post under 90 days old is checked; the other runs check the
// latest 10. A post whose comment count hasn't changed is skipped, except that
// each one is re-read weekly (a deleted comment can hide a new one).
//
// The state file is committed to a public repository, so it holds only ids
// and counts; other people's post ids (tags) are hashed.
// ---------------------------------------------------------------------------

const DAY = 86400_000;
const LATEST = 10;
const WINDOW_DAYS = 90;
const REREAD_DAYS = 7;

export const STATE_FILE = path.join(path.dirname(CALENDAR_DIR), 'comments-state.json');
export const OWN = (env.IG_HANDLE || '@zenlot_app').replace(/^@/, '').toLowerCase();

export interface ListenState {
  seen: Record<string, string>; // comment id → first emailed at
  tags?: Record<string, string>; // hashed tagged-post id → first emailed at
  posts?: Record<string, { count: number; readAt: string }>; // our post id → what was last read in full
  fullScanDay?: string; // YYYY-MM-DD of the last 90-day scan
}

export interface Inbound {
  comment: IgReply;
  /** Set when this is a reply inside a thread. */
  threadOf?: string;
  post: Pick<IgMedia, 'id' | 'caption' | 'permalink'>;
  /** We replied in this thread after it. */
  answered: boolean;
  flag: CommentCategory | null;
}

export interface Heard {
  items: Inbound[];
  tags: Array<{ tag: IgTag; flag: CommentCategory | null }>;
  /** Anything that couldn't be read, in words. Shown at the top of the digest: silence must never look like "nothing there". */
  gaps: string[];
  /** State to save once the digest is out. `seen` and `tags` are added then (markSent). */
  next: ListenState;
  postsChecked: number;
}

export function loadState(): ListenState {
  if (!fs.existsSync(STATE_FILE)) return { seen: {} };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as ListenState;
}

export function saveState(state: ListenState): void {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export const tagKey = (id: string) => crypto.createHash('sha256').update(`tag:${id}`).digest('hex').slice(0, 16);

/** Forgets what can no longer come back: comments can be re-read for as long as their post is inside the window. */
function prune(state: ListenState, now: Date): ListenState {
  const recent = (at: string) => now.getTime() - Date.parse(at) < (WINDOW_DAYS + REREAD_DAYS) * 2 * DAY;
  const keep = (r: Record<string, string> = {}) => Object.fromEntries(Object.entries(r).filter(([, at]) => recent(at)));
  return {
    ...state,
    seen: keep(state.seen),
    tags: keep(state.tags),
    posts: Object.fromEntries(Object.entries(state.posts ?? {}).filter(([, p]) => recent(p.readAt))),
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Reader = Pick<InstagramService, 'listMediaSince' | 'getComments' | 'getTags'>;

export async function listen(state: ListenState, now: Date, opts: { all?: boolean; service?: Reader } = {}): Promise<Heard> {
  const service = opts.service ?? instagramService;
  const gaps: string[] = [];
  const next = prune(structuredClone(state), now);
  next.posts ??= {};
  const today = now.toISOString().slice(0, 10);
  const full = opts.all || state.fullScanDay !== today;

  const media = await service.listMediaSince(new Date(now.getTime() - WINDOW_DAYS * DAY));
  if (!media.complete) gaps.push(`not every post from the last ${WINDOW_DAYS} days could be listed`);
  const due = full ? media.items : media.items.slice(0, LATEST);

  const items: Inbound[] = [];
  let failed = 0;
  let partial = 0;
  for (const [i, post] of due.entries()) {
    const last = state.posts?.[post.id];
    const unchanged = last !== undefined && post.comments_count === last.count && now.getTime() - Date.parse(last.readAt) < REREAD_DAYS * DAY;
    if (!opts.all && i >= LATEST && unchanged) continue;
    let read: Awaited<ReturnType<Reader['getComments']>>;
    try {
      read = await service.getComments(post.id);
    } catch {
      failed++; // one post must not hide the others
      continue;
    }
    if (!read.complete) partial++;
    else if (typeof post.comments_count === 'number') next.posts[post.id] = { count: post.comments_count, readAt: now.toISOString() };

    const add = (c: IgReply, answered: boolean, threadOf?: string) => {
      if (!c.username || c.username.toLowerCase() === OWN || (!opts.all && state.seen[c.id])) return;
      items.push({ comment: c, threadOf, post, answered, flag: redFlags(c.username, c.text ?? '') });
    };
    for (const c of read.items) {
      const replies = c.replies?.data ?? [];
      const ours = replies.filter((r) => r.username?.toLowerCase() === OWN).map((r) => Date.parse(r.timestamp));
      add(c, ours.length > 0);
      for (const r of replies) add(r, ours.some((t) => t >= Date.parse(r.timestamp)), c.username);
    }
  }
  if (failed) gaps.push(`comments on ${failed} post(s) could not be read`);
  if (partial) gaps.push(`${partial} post(s) have more comments than one run reads`);
  if (full && !failed) next.fullScanDay = today;

  const tags: Heard['tags'] = [];
  try {
    const found = await service.getTags();
    if (!found.complete) gaps.push('there are more tagged posts than one run reads');
    for (const tag of found.items) {
      if (tag.username?.toLowerCase() === OWN || (!opts.all && state.tags?.[tagKey(tag.id)])) continue;
      tags.push({ tag, flag: redFlags(tag.username ?? '', tag.caption ?? '') });
    }
  } catch (err) {
    gaps.push(/permission|#10\b|#200\b|access/i.test(message(err)) ? 'tags: not ready, the token lacks permission' : 'tags could not be read');
  }
  return { items, tags, gaps, next, postsChecked: due.length };
}

/** Records that these were emailed, so each is sent once. */
export function markSent(heard: Heard, at: Date): ListenState {
  const state = heard.next;
  for (const it of heard.items) state.seen[it.comment.id] ??= at.toISOString();
  state.tags ??= {};
  for (const { tag } of heard.tags) state.tags[tagKey(tag.id)] ??= at.toISOString();
  return state;
}

export const isUrgent = (c: CommentCategory | null) => c !== null && URGENT.includes(c);
