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
  async publish(imageUrls: string[], caption: string, altTexts: string[] = []): Promise<{ mediaId: string; permalink?: string }> {
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
    const { id: mediaId } = await this.call<{ id: string }>('POST', `${env.IG_USER_ID}/media_publish`, { creation_id: creationId });

    let permalink: string | undefined;
    try {
      ({ permalink } = await this.call<{ permalink?: string }>('GET', mediaId, { fields: 'permalink' }));
    } catch {
      // permalink is nice-to-have
    }
    return { mediaId, permalink };
  }

  async getInsights(mediaId: string): Promise<PostInsights> {
    const metrics = ['reach', 'saved', 'shares', 'likes', 'comments', 'views'];
    const out: PostInsights = { fetchedAt: new Date().toISOString() };
    const res = await this.call<{ data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }> }>(
      'GET',
      `${mediaId}/insights`,
      { metric: metrics.join(',') },
    );
    for (const m of res.data) {
      const value = m.total_value?.value ?? m.values?.[0]?.value;
      if (typeof value === 'number') (out as unknown as Record<string, number>)[m.name] = value;
    }
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
