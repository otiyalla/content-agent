import Snoowrap from 'snoowrap';
import { env } from '../../config/env';
import { SocialPost } from './twitter.service';

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
      console.warn('⚠️ Reddit credentials are not fully set. Reddit service will run in mock mode.');
    }
  }

  /**
   * Searches for recent posts in a specific subreddit containing keywords.
   */
  async searchPainPoints(subreddit: string, query: string, maxResults: number = 10): Promise<SocialPost[]> {
    if (!this.client) {
      console.log(`[Mock Reddit] Searching r/${subreddit} for: ${query}`);
      return [];
    }

    try {
      const results = await this.client.getSubreddit(subreddit).search({
        query: query,
        time: 'week',
        sort: 'relevance',
      });

      // Slice the results to mimic limit
      const limitedResults = results.slice(0, maxResults);

      return limitedResults.map((post) => ({
        id: post.id,
        authorId: post.author.name,
        content: `${post.title}\n\n${post.selftext}`,
        url: `https://reddit.com${post.permalink}`,
        platform: 'reddit',
      }));
    } catch (error) {
      console.error(`Error searching Reddit (r/${subreddit}):`, error);
      return [];
    }
  }

  /**
   * Replies to a specific Reddit post or comment.
   */
  async replyToPost(postId: string, content: string): Promise<string | null> {
    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Reddit] Reply to ${postId}: "${content}"`);
      return 'mock-comment-id';
    }

    try {
      const submission = this.client.getSubmission(postId);
      // @ts-ignore - Snoowrap type bug with recursive Promises
      const reply = await submission.reply(content);
      console.log(`✅ Reddit reply posted! ID: ${reply.id}`);
      return reply.id;
    } catch (error) {
      console.error('Error replying on Reddit:', error);
      return null;
    }
  }

  /**
   * Creates a new self-post (text post) in a specific subreddit.
   */
  async createPost(subreddit: string, title: string, content: string): Promise<string | null> {
    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Reddit] New Post in r/${subreddit} | Title: "${title}"\nContent: "${content}"`);
      return 'mock-post-id';
    }

    try {
      // @ts-ignore - Snoowrap type bug with recursive Promises
      const post = await this.client.getSubreddit(subreddit).submitSelfpost({
        title: title,
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
