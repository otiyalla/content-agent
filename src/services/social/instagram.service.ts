import { env } from '../../config/env';
import type { PostInsights } from '../../instagram/types';

// ---------------------------------------------------------------------------
// Instagram publishing + insights for our own professional account.
//
// Two token types are supported, detected from the token itself:
//   - Unified Login system-user token ("EAA…", never expires) → graph.facebook.com
//     Permissions: instagram_basic, instagram_content_publish, instagram_manage_insights
//   - Instagram Login user token ("IG…", 60 days, refreshable)  → graph.instagram.com
//     Permissions: instagram_business_basic / _content_publish / _manage_insights
// Set IG_API_HOST to override the detection.
//
// Publishing is a two-step flow: create a media container from a public JPEG
// URL, wait for it to finish processing, then publish it. Carousels create a
// child container per image, then a parent CAROUSEL container.
// ---------------------------------------------------------------------------

export type TokenKind = 'facebook' | 'instagram';

export interface IgReply {
  id: string;
  text: string;
  username: string;
  timestamp: string;
}

interface Page<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/** Everything read, or as much as the page cap allowed. Never mistake an incomplete list for the whole. */
export interface Listed<T> {
  items: T[];
  complete: boolean;
}

export interface IgComment extends IgReply {
  like_count?: number;
  hidden?: boolean;
  replies?: Page<IgReply>;
  /** False if some replies couldn't be read (page cap). */
  repliesComplete?: boolean;
}

export interface IgMedia {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp: string;
  comments_count?: number;
}

/** Missing = not available, which is not the same as 0. */
export interface AccountInsights {
  profileViews?: number;
  websiteClicks?: number; // taps on the link in bio
  reach?: number;
}

export interface IgTag {
  id: string;
  username?: string;
  caption?: string;
  permalink?: string;
  timestamp: string;
}

export function tokenKind(token: string | undefined = env.IG_ACCESS_TOKEN): TokenKind {
  if (env.IG_API_HOST) return env.IG_API_HOST.includes('facebook') ? 'facebook' : 'instagram';
  return token?.startsWith('IG') ? 'instagram' : 'facebook';
}

function baseUrl(): string {
  return tokenKind() === 'facebook' ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

/** Instagram couldn't be asked whether a post is already live, so nobody knows. Never retry a publish without asking again. */
export class LiveCheckError extends Error {}

/** Which live posts can count as "this one": not older than `since`, and not in `exclude`. */
export interface LiveMatch {
  since?: Date;
  exclude?: Set<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class InstagramService {
  get configured(): boolean {
    return Boolean(env.IG_USER_ID && env.IG_ACCESS_TOKEN);
  }

  private url(pathname: string, params: Record<string, string> = {}): string {
    const u = new URL(`${baseUrl()}/${env.IG_GRAPH_VERSION}/${pathname}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  private async call<T>(method: 'GET' | 'POST', pathname: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.configured) throw new Error('Instagram is not configured (IG_USER_ID / IG_ACCESS_TOKEN)');
    const all = { ...params, access_token: env.IG_ACCESS_TOKEN! };
    const res =
      method === 'GET'
        ? await fetch(this.url(pathname, all))
        : await fetch(this.url(pathname), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(all),
          });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || body.error) {
      throw new InstagramApiError(`Instagram ${method} ${pathname} failed: ${body.error?.message ?? res.statusText}`, res.status, body);
    }
    return body;
  }

  private async createContainer(params: Record<string, string>): Promise<string> {
    const { id } = await this.call<{ id: string }>('POST', `${env.IG_USER_ID}/media`, params);
    return id;
  }

  /** Polls a container until FINISHED. Meta recommends checking ~once a minute for up to 5 minutes. */
  private async waitForContainer(id: string, maxWaitMs = 5 * 60_000): Promise<void> {
    const started = Date.now();
    let delay = 3_000;
    while (Date.now() - started < maxWaitMs) {
      const { status_code } = await this.call<{ status_code: string }>('GET', id, { fields: 'status_code' });
      if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${id} status ${status_code}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
    throw new Error(`Container ${id} not ready after ${maxWaitMs / 1000}s`);
  }

  /**
   * Creates an image container with alt text. alt_text support differs between
   * API hosts and versions, so if it's rejected we retry without it rather than
   * lose the post.
   */
  private async createImageContainer(params: Record<string, string>, altText?: string): Promise<string> {
    if (!altText) return this.createContainer(params);
    try {
      return await this.createContainer({ ...params, alt_text: altText });
    } catch (err) {
      console.warn(`  alt_text rejected (${err instanceof Error ? err.message : err}) — retrying without it`);
      return this.createContainer(params);
    }
  }

  /**
   * Publishes one image or a carousel. Returns the published media id and permalink.
   * imageUrls must be public JPEG URLs; altTexts[i] describes imageUrls[i].
   */
  async publish(imageUrls: string[], caption: string, altTexts: string[] = [], match: LiveMatch = {}): Promise<{ mediaId: string; permalink?: string }> {
    let creationId: string;

    if (imageUrls.length === 1) {
      creationId = await this.createImageContainer({ image_url: imageUrls[0], caption }, altTexts[0]);
    } else {
      const children: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        children.push(await this.createImageContainer({ image_url: imageUrls[i], is_carousel_item: 'true' }, altTexts[i]));
      }
      for (const child of children) await this.waitForContainer(child);
      creationId = await this.createContainer({ media_type: 'CAROUSEL', children: children.join(','), caption });
    }

    await this.waitForContainer(creationId);
    let mediaId: string;
    try {
      ({ id: mediaId } = await this.call<{ id: string }>('POST', `${env.IG_USER_ID}/media_publish`, { creation_id: creationId }));
    } catch (err) {
      // The post may be live even though the reply was lost or an error came back. Look before calling it failed.
      const live = await this.findPublishedAfterError(caption, match);
      if (!live) throw err;
      console.warn(`  media_publish reported an error (${err instanceof Error ? err.message : err}) but the post is live`);
      return live;
    }

    let permalink: string | undefined;
    try {
      ({ permalink } = await this.call<{ permalink?: string }>('GET', mediaId, { fields: 'permalink' }));
    } catch {
      // permalink is nice-to-have
    }
    return { mediaId, permalink };
  }

  /** A recent post with exactly this caption (ignoring whitespace), if there is one. Throws LiveCheckError if Instagram can't be asked. */
  async findPublished(caption: string, match: LiveMatch = {}): Promise<{ mediaId: string; permalink?: string; timestamp?: string } | null> {
    const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
    const wanted = norm(caption);
    let media: Awaited<ReturnType<InstagramService['listRecentMedia']>>;
    try {
      media = await this.listRecentMedia(25);
    } catch (err) {
      throw new LiveCheckError(`could not check whether the post is already live: ${err instanceof Error ? err.message : err}`);
    }
    const hit = media.find(
      (m) =>
        norm(m.caption ?? '') === wanted && !match.exclude?.has(m.id) && !(match.since && Date.parse(m.timestamp) < match.since.getTime()),
    );
    return hit ? { mediaId: hit.id, permalink: hit.permalink, timestamp: hit.timestamp } : null;
  }

  /** Null only if Instagram answered and the post isn't there; throws LiveCheckError if it never answered. */
  private async findPublishedAfterError(caption: string, match: LiveMatch): Promise<{ mediaId: string; permalink?: string } | null> {
    let lastError: LiveCheckError | null = null;
    for (const wait of [5_000, 10_000, 20_000]) {
      await sleep(wait);
      try {
        const live = await this.findPublished(caption, match);
        if (live) return { mediaId: live.mediaId, permalink: live.permalink };
        lastError = null;
      } catch (err) {
        lastError = err as LiveCheckError; // keep trying
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  /**
   * Publishes one image as a Story (1080x1920 JPEG at a public URL). Stories have no
   * caption, and the API can't add them to a Highlight — that is done in the app.
   */
  async publishStory(imageUrl: string): Promise<{ mediaId: string }> {
    const creationId = await this.createContainer({ media_type: 'STORIES', image_url: imageUrl });
    await this.waitForContainer(creationId);
    const { id: mediaId } = await this.call<{ id: string }>('POST', `${env.IG_USER_ID}/media_publish`, { creation_id: creationId });
    return { mediaId };
  }

  async getInsights(mediaId: string): Promise<PostInsights> {
    const metrics = ['reach', 'saved', 'shares', 'likes', 'comments', 'views', 'follows', 'profile_visits'];
    const out: PostInsights = { fetchedAt: new Date().toISOString() };
    const names: Record<string, keyof PostInsights> = { profile_visits: 'profileVisits' };
    const res = await this.call<{ data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }> }>(
      'GET',
      `${mediaId}/insights`,
      { metric: metrics.join(',') },
    );
    for (const m of res.data) {
      const value = m.total_value?.value ?? m.values?.[0]?.value;
      if (typeof value === 'number') (out as unknown as Record<string, number>)[names[m.name] ?? m.name] = value;
    }
    // Bio-link taps come from profile_activity broken down by action type. Optional: never fail the fetch over it.
    try {
      const act = await this.call<{ data: Array<{ total_value?: { value?: number; breakdowns?: Array<{ results?: Array<{ dimension_values: string[]; value: number }> }> } }> }>(
        'GET',
        `${mediaId}/insights`,
        { metric: 'profile_activity', breakdown: 'action_type' },
      );
      const results = act.data[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      out.linkTaps = results.filter((r) => r.dimension_values.includes('bio_link_clicked')).reduce((sum, r) => sum + r.value, 0);
    } catch {
      // older posts or API versions may not support the breakdown
    }
    return out;
  }

  /**
   * Account-wide totals between two dates (max 30 days). Each metric is asked for on its own, so one that
   * Instagram stops serving can't blank the rest. websiteClicks is the link in bio; profile_links_taps
   * (address, call, email and text buttons) is something else and isn't read.
   */
  async getAccountInsights(since: Date, until: Date): Promise<AccountInsights> {
    const metrics = { profileViews: 'profile_views', websiteClicks: 'website_clicks', reach: 'reach' } as const;
    const out: AccountInsights = {};
    const failed: string[] = [];
    await Promise.all(
      (Object.keys(metrics) as Array<keyof typeof metrics>).map(async (key) => {
        try {
          const res = await this.call<{ data: Array<{ name: string; total_value?: { value: number } }> }>('GET', `${env.IG_USER_ID}/insights`, {
            metric: metrics[key],
            period: 'day',
            metric_type: 'total_value',
            since: String(Math.floor(since.getTime() / 1000)),
            until: String(Math.floor(until.getTime() / 1000)),
          });
          out[key] = res.data.find((d) => d.name === metrics[key])?.total_value?.value;
        } catch {
          failed.push(metrics[key]);
        }
      }),
    );
    if (failed.length) console.warn(`[Instagram] account metrics not available: ${failed.join(', ')}`);
    return out;
  }

  /**
   * The connected Instagram account. On graph.facebook.com "me" is the system
   * user, not the Instagram account, so we query the account ID directly.
   */
  async getAccount(): Promise<{ user_id?: string; username: string; followers_count?: number; media_count?: number }> {
    if (tokenKind() === 'facebook') {
      const a = await this.call<{ id: string; username: string; followers_count?: number; media_count?: number }>(
        'GET',
        env.IG_USER_ID!,
        { fields: 'id,username,followers_count,media_count' },
      );
      return { user_id: a.id, ...a };
    }
    return this.call('GET', 'me', { fields: 'user_id,username,followers_count,media_count' });
  }

  /** The account's most recent posts, newest first (includes posts made by hand in the app). */
  async listRecentMedia(limit = 10): Promise<Array<{ id: string; caption?: string; permalink?: string; timestamp: string; media_type?: string }>> {
    const id = tokenKind() === 'facebook' ? env.IG_USER_ID! : 'me';
    const res = await this.call<{ data: Array<{ id: string; caption?: string; permalink?: string; timestamp: string; media_type?: string }> }>(
      'GET',
      `${id}/media`,
      { fields: 'id,caption,permalink,timestamp,media_type', limit: String(limit) },
    );
    return res.data;
  }

  /** Reads a list page by page. Follows the cursor, never the raw "next" URL, which contains the token. */
  private async list<T>(pathname: string, params: Record<string, string>, maxPages: number, opts: { first?: Page<T>; stop?: (item: T) => boolean } = {}): Promise<Listed<T>> {
    const items: T[] = [];
    let page = opts.first ?? (await this.call<Page<T>>('GET', pathname, params));
    for (let n = 1; ; n++) {
      for (const item of page.data ?? []) {
        if (opts.stop?.(item)) return { items, complete: true };
        items.push(item);
      }
      const after = page.paging?.cursors?.after;
      if (!page.paging?.next || !after) return { items, complete: true };
      if (n >= maxPages) return { items, complete: false };
      page = await this.call<Page<T>>('GET', pathname, { ...params, after });
    }
  }

  /** Our own posts published since `since`, newest first. */
  async listMediaSince(since: Date, maxPages = 5): Promise<Listed<IgMedia>> {
    const id = tokenKind() === 'facebook' ? env.IG_USER_ID! : 'me';
    return this.list<IgMedia>(`${id}/media`, { fields: 'id,caption,permalink,timestamp,comments_count', limit: '50' }, maxPages, {
      stop: (m) => Date.parse(m.timestamp) < since.getTime(),
    });
  }

  /** Every comment on a post with every reply. Needs instagram_manage_comments. */
  async getComments(mediaId: string, maxPages = 10): Promise<Listed<IgComment>> {
    const replyFields = 'id,text,username,timestamp';
    const out = await this.list<IgComment>(
      `${mediaId}/comments`,
      { fields: `id,text,username,timestamp,like_count,hidden,replies.limit(50){${replyFields}}`, limit: '50' },
      maxPages,
    );
    for (const c of out.items) {
      if (!c.replies?.paging?.next) continue;
      const replies = await this.list<IgReply>(`${c.id}/replies`, { fields: replyFields, limit: '50' }, maxPages, { first: c.replies });
      c.replies = { data: replies.items };
      c.repliesComplete = replies.complete;
      if (!replies.complete) out.complete = false;
    }
    return out;
  }

  /** Public posts that tag our account, newest first. Story mentions and caption @mentions aren't included. */
  async getTags(maxPages = 2): Promise<Listed<IgTag>> {
    return this.list<IgTag>(`${env.IG_USER_ID}/tags`, { fields: 'id,username,caption,permalink,timestamp', limit: '50' }, maxPages);
  }

  /** Public profile fields shown to visitors: bio, link in bio, follower count. Read-only. */
  async getProfile(): Promise<{ username: string; name?: string; biography?: string; website?: string; followers_count?: number; media_count?: number }> {
    const id = tokenKind() === 'facebook' ? env.IG_USER_ID! : 'me';
    return this.call('GET', id, { fields: 'username,name,biography,website,followers_count,media_count' });
  }

  /** Read-only check that publishing is allowed: how many API posts were used in the last 24h. */
  async getPublishingLimit(): Promise<{ quota_usage?: number; config?: { quota_total?: number } }> {
    const res = await this.call<{ data: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
      'GET',
      `${env.IG_USER_ID}/content_publishing_limit`,
      { fields: 'quota_usage,config' },
    );
    return res.data[0] ?? {};
  }

  /** System-user tokens (Unified Login) never expire; only Instagram Login tokens need refreshing. */
  get tokenExpires(): boolean {
    return tokenKind() === 'instagram';
  }

  /**
   * Long-lived tokens last 60 days. Refreshing returns a new 60-day token
   * (the current token must be at least 24h old and still valid).
   */
  async refreshToken(): Promise<{ access_token: string; expires_in: number }> {
    const u = new URL('https://graph.instagram.com/refresh_access_token');
    u.searchParams.set('grant_type', 'ig_refresh_token');
    u.searchParams.set('access_token', env.IG_ACCESS_TOKEN!);
    const res = await fetch(u);
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || !body.access_token) throw new InstagramApiError(`Token refresh failed: ${body.error?.message ?? res.statusText}`, res.status, body);
    return { access_token: body.access_token, expires_in: body.expires_in ?? 0 };
  }
}

export const instagramService = new InstagramService();
