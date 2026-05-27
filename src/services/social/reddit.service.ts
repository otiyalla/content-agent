import Snoowrap from 'snoowrap';
import { env } from '../../config/env';
import { SocialPost } from './twitter.service';

// ---------------------------------------------------------------------------
// Subreddit tiers — Reddit Community Builder strategy
// Primary: highest signal, most active pain points for Zenlot
// Secondary: adjacent communities, broader reach
// Niche: smaller but highly targeted to forex/risk management
// ---------------------------------------------------------------------------

export const SUBREDDIT_TIERS = {
  primary: ['Forex', 'Daytrading'],
  secondary: ['algotrading', 'investing', 'personalfinance', 'StockMarket'],
  niche: ['FXtraders', 'TradingView', 'Forex_Trading'],
} as const;

export type SubredditTier = keyof typeof SUBREDDIT_TIERS;

export interface RedditKarma {
  linkKarma: number;
  commentKarma: number;
  total: number;
}

// ---------------------------------------------------------------------------
// RedditService
// ---------------------------------------------------------------------------

export class RedditService {
  private client: Snoowrap | null = null;

  constructor() {
    if (
      env.REDDIT_CLIENT_ID &&
      env.REDDIT_CLIENT_SECRET &&
      env.REDDIT_USERNAME &&
      env.REDDIT_PASSWORD
    ) {
      this.client = new Snoowrap({
        userAgent: env.REDDIT_USER_AGENT,
        clientId: env.REDDIT_CLIENT_ID,
        clientSecret: env.REDDIT_CLIENT_SECRET,
        username: env.REDDIT_USERNAME,
        password: env.REDDIT_PASSWORD,
      });
    } else {
      console.warn(
        '⚠️  Reddit credentials not fully set — service running in mock mode.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Discovery & monitoring
  // -------------------------------------------------------------------------

  /**
   * Searches recent submissions in a subreddit for a keyword query.
   * Returns enriched SocialPost with upvotes, comment count, and subreddit.
   */
  async searchPainPoints(
    subreddit: string,
    query: string,
    maxResults: number = 10,
  ): Promise<SocialPost[]> {
    if (!this.client) {
      console.log(`[Mock Reddit] searchPainPoints r/${subreddit} — "${query}"`);
      return [];
    }

    try {
      const results = await this.client.getSubreddit(subreddit).search({
        query,
        time: 'week',
        sort: 'relevance',
      });

      return results.slice(0, maxResults).map((post) => ({
        id: post.id,
        authorId: post.author.name,
        content: `${post.title}\n\n${post.selftext}`,
        url: `https://reddit.com${post.permalink}`,
        platform: 'reddit' as const,
        upvotes: post.score,
        commentCount: post.num_comments,
        subreddit,
        awards: (post as any).total_awards_received ?? 0,
        isComment: false,
        postTitle: post.title,
      }));
    } catch (error) {
      console.error(`Error searching r/${subreddit} for "${query}":`, error);
      return [];
    }
  }

  /**
   * Searches comments inside a subreddit — surfaces pain points expressed in
   * discussion threads that submission-level search misses.
   * Reddit Community Builder: comment threads are where real trader frustration lives.
   */
  async searchComments(
    subreddit: string,
    query: string,
    maxResults: number = 5,
  ): Promise<SocialPost[]> {
    if (!this.client) {
      console.log(`[Mock Reddit] searchComments r/${subreddit} — "${query}"`);
      return [];
    }

    try {
      // Snoowrap doesn't expose comment search directly — use the search endpoint
      // with a type filter on comments via the raw API
      const sub = this.client.getSubreddit(subreddit);
      const submissions = await sub.search({ query, time: 'week', sort: 'relevance' });
      const topPosts = submissions.slice(0, 3);

      const commentPosts: SocialPost[] = [];

      for (const post of topPosts) {
        if (commentPosts.length >= maxResults) break;
        try {
          // @ts-ignore – Snoowrap recursive Promise types
          const comments = await post.comments.fetchAll({ amount: 5 });
          for (const comment of (comments as any[])) {
            if (commentPosts.length >= maxResults) break;
            if (!comment.body || comment.body === '[deleted]') continue;
            if (comment.score < 1) continue; // skip downvoted noise

            commentPosts.push({
              id: comment.id,
              authorId: comment.author?.name ?? 'unknown',
              content: comment.body,
              url: `https://reddit.com${comment.permalink}`,
              platform: 'reddit' as const,
              upvotes: comment.score,
              commentCount: 0,
              subreddit,
              awards: (comment as any).total_awards_received ?? 0,
              isComment: true,
              postTitle: post.title,
            });
          }
        } catch {
          // comments may fail on locked/archived posts — skip silently
        }
      }

      return commentPosts;
    } catch (error) {
      console.error(`Error searching comments in r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Fetches hot posts from a subreddit.
   * Used by the community engager to find high-visibility threads to participate in.
   * Per Reddit Community Builder: engage with trending discussions, not just searches.
   */
  async getHotPosts(subreddit: string, limit: number = 10): Promise<SocialPost[]> {
    if (!this.client) {
      console.log(`[Mock Reddit] getHotPosts r/${subreddit} (limit: ${limit})`);
      return [];
    }

    try {
      // @ts-ignore – Snoowrap type
      const posts = await this.client.getSubreddit(subreddit).getHot({ limit });

      return (posts as any[]).map((post: any) => ({
        id: post.id,
        authorId: post.author.name,
        content: `${post.title}\n\n${post.selftext ?? ''}`.trim(),
        url: `https://reddit.com${post.permalink}`,
        platform: 'reddit' as const,
        upvotes: post.score,
        commentCount: post.num_comments,
        subreddit,
        awards: (post as any).total_awards_received ?? 0,
        isComment: false,
        postTitle: post.title,
      }));
    } catch (error) {
      console.error(`Error fetching hot posts from r/${subreddit}:`, error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Account health
  // -------------------------------------------------------------------------

  /**
   * Returns the current account's karma.
   * Reddit Community Builder target: 10,000+ combined karma for trusted contributor status.
   * Low karma = reduced visibility; track this to catch shadowban risk early.
   */
  async getUserKarma(): Promise<RedditKarma | null> {
    if (!this.client) {
      console.log('[Mock Reddit] getUserKarma');
      return null;
    }

    try {
      // @ts-ignore – Snoowrap type
      const me = await this.client.getMe();
      return {
        linkKarma: me.link_karma,
        commentKarma: me.comment_karma,
        total: me.link_karma + me.comment_karma,
      };
    } catch (error) {
      console.error('Error fetching karma:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Community actions
  // -------------------------------------------------------------------------

  /**
   * Upvotes a post or comment as a community support action.
   * Reddit Community Builder 90/10 rule: upvoting valuable content is part of
   * authentic participation — not just posting replies.
   */
  async upvotePost(postId: string): Promise<boolean> {
    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Reddit] Upvote ${postId}`);
      return true;
    }

    try {
      const submission = this.client.getSubmission(postId);
      // @ts-ignore – Snoowrap recursive Promise
      await submission.upvote();
      return true;
    } catch (error) {
      console.error(`Error upvoting ${postId}:`, error);
      return false;
    }
  }

  /**
   * Replies to a Reddit submission or comment.
   * Developer Advocate rule: always disclose affiliation naturally in the reply body.
   * The LLM prompt for Reddit replies handles this — never strip it out here.
   */
  async replyToPost(postId: string, content: string): Promise<string | null> {
    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Reddit] Reply to ${postId}:\n${content}\n`);
      return 'mock-comment-id';
    }

    try {
      const submission = this.client.getSubmission(postId);
      // @ts-ignore – Snoowrap type bug with recursive Promises
      const reply = await submission.reply(content);
      console.log(`✅ Reddit reply posted! ID: ${reply.id}`);
      return reply.id;
    } catch (error) {
      console.error('Error replying on Reddit:', error);
      return null;
    }
  }

  /**
   * Replies to a specific comment (not a top-level submission).
   */
  async replyToComment(commentId: string, content: string): Promise<string | null> {
    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Reddit] Reply to comment ${commentId}:\n${content}\n`);
      return 'mock-comment-reply-id';
    }

    try {
      const comment = this.client.getComment(commentId);
      // @ts-ignore – Snoowrap type bug
      const reply = await comment.reply(content);
      console.log(`✅ Reddit comment reply posted! ID: ${reply.id}`);
      return reply.id;
    } catch (error) {
      console.error('Error replying to comment:', error);
      return null;
    }
  }

  /**
   * Creates a new text post in a subreddit.
   * Used by the educational content workflow — value-first posts, no promotion.
   */
  async createPost(
    subreddit: string,
    title: string,
    content: string,
  ): Promise<string | null> {
    if (!this.client || env.DRY_RUN) {
      console.log(
        `[DRY RUN - Reddit] New post in r/${subreddit}\nTitle: "${title}"\n\n${content}\n`,
      );
      return 'mock-post-id';
    }

    try {
      // @ts-ignore – Snoowrap type bug with recursive Promises
      const post = await this.client.getSubreddit(subreddit).submitSelfpost({
        title,
        text: content,
      });
      console.log(`✅ Reddit post created! ID: ${post.id}`);
      return post.id;
    } catch (error) {
      console.error(`Error creating post in r/${subreddit}:`, error);
      return null;
    }
  }
}

export const redditService = new RedditService();
