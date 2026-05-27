import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';
import { env } from '../../config/env';

export interface SocialPost {
  id: string;
  authorId: string;
  content: string;
  url: string;
  platform: 'twitter' | 'reddit';
  // Reddit-specific metadata (populated for reddit posts/comments only)
  upvotes?: number;
  commentCount?: number;
  subreddit?: string;
  awards?: number;
  isComment?: boolean;
  postTitle?: string; // original post title when this is a comment
}

export class TwitterService {
  private client: TwitterApi | null = null;
  private readOnlyClient: TwitterApiReadOnly | null = null;

  constructor() {
    if (env.TWITTER_OAuth2_ACCESS_TOKEN) {
      this.client = new TwitterApi(env.TWITTER_OAuth2_ACCESS_TOKEN);
      this.readOnlyClient = this.client.readOnly;
    } else if (
      env.TWITTER_APP_KEY &&
      env.TWITTER_APP_SECRET &&
      env.TWITTER_ACCESS_TOKEN &&
      env.TWITTER_ACCESS_SECRET
    ) {
      this.client = new TwitterApi({
        appKey: env.TWITTER_APP_KEY,
        appSecret: env.TWITTER_APP_SECRET,
        accessToken: env.TWITTER_ACCESS_TOKEN,
        accessSecret: env.TWITTER_ACCESS_SECRET,
      });
      this.readOnlyClient = this.client.readOnly;
    } else {
      console.warn('⚠️ Twitter credentials are not fully set. Twitter service will run in mock mode.');
    }
  }

  /**
   * Searches for recent tweets containing specific keywords.
   */
  async searchPainPoints(query: string, maxResults: number = 10): Promise<SocialPost[]> {
    if (!this.readOnlyClient) {
      console.log(`[Mock Twitter] Searching for: ${query}`);
      return [];
    }

    try {
      // X/Twitter API v2 search requires max_results to be between 10 and 100.
      const apiMaxResults = Math.max(10, Math.min(100, maxResults));
      const response = await this.readOnlyClient.v2.search(query, {
        max_results: apiMaxResults,
        'tweet.fields': ['id', 'text', 'author_id', 'created_at'],
      });

      const posts: SocialPost[] = [];
      const tweets = response.tweets || [];
      for (const tweet of tweets) {
        posts.push({
          id: tweet.id,
          authorId: tweet.author_id || 'unknown',
          content: tweet.text,
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          platform: 'twitter',
        });
      }
      return posts.slice(0, maxResults);
    } catch (error) {
      console.error('Error searching Twitter:', error);
      return [];
    }
  }

  /**
   * Fetches recent tweets from a specific user by handle.
   * Used by community-engager to monitor thought leaders.
   */
  async getUserRecentTweets(handle: string, maxResults: number = 5): Promise<SocialPost[]> {
    if (!this.readOnlyClient) {
      console.log(`[Mock Twitter] Getting recent tweets from @${handle}`);
      return [];
    }

    try {
      const user = await this.readOnlyClient.v2.userByUsername(handle);
      if (!user.data) return [];

      const timeline = await this.readOnlyClient.v2.userTimeline(user.data.id, {
        max_results: Math.max(5, Math.min(100, maxResults)),
        'tweet.fields': ['id', 'text', 'author_id', 'created_at', 'public_metrics'],
        exclude: ['retweets', 'replies'],
      });

      const tweets = timeline.tweets || [];
      return tweets.slice(0, maxResults).map((tweet) => ({
        id: tweet.id,
        authorId: handle,
        content: tweet.text,
        url: `https://twitter.com/${handle}/status/${tweet.id}`,
        platform: 'twitter' as const,
      }));
    } catch (error) {
      console.error(`Error fetching tweets from @${handle}:`, error);
      return [];
    }
  }

  /**
   * Splits a long text into multiple tweets of at most 280 characters.
   * Thread tweets are numbered (1/n) for readability.
   */
  private splitIntoTweets(content: string): string[] {
    if (content.length <= 280) {
      return [content];
    }

    const paragraphs = content.split(/\n\s*\n/);
    const tweets: string[] = [];
    let currentTweet = '';

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if (trimmed.length > 280) {
        if (currentTweet) {
          tweets.push(currentTweet);
          currentTweet = '';
        }

        let index = 0;
        while (index < trimmed.length) {
          tweets.push(trimmed.slice(index, index + 280).trim());
          index += 280;
        }
        continue;
      }

      const potentialTweet = currentTweet ? `${currentTweet}\n\n${trimmed}` : trimmed;
      if (potentialTweet.length <= 280) {
        currentTweet = potentialTweet;
      } else {
        if (currentTweet) {
          tweets.push(currentTweet);
        }
        currentTweet = trimmed;
      }
    }

    if (currentTweet) {
      tweets.push(currentTweet);
    }

    return tweets;
  }

  /**
   * Posts a new tweet or replies to an existing one.
   */
  async postTweet(content: string, replyToTweetId?: string): Promise<string | null> {
    const tweets = this.splitIntoTweets(content);

    if (!this.client || env.DRY_RUN) {
      console.log(`[DRY RUN - Twitter] Proposed ${tweets.length > 1 ? `thread of ${tweets.length} tweets` : 'tweet'}:`);
      tweets.forEach((tweet, index) => {
        console.log(`--- Tweet ${index + 1}/${tweets.length} ---`);
        console.log(tweet);
      });
      console.log('-------------------------------------------');
      return 'mock-tweet-id';
    }

    try {
      if (tweets.length === 1) {
        const response = await this.client.v2.tweet(tweets[0], {
          reply: replyToTweetId ? { in_reply_to_tweet_id: replyToTweetId } : undefined,
        });
        console.log(`✅ Tweet posted! ID: ${response.data.id}`);
        return response.data.id;
      } else {
        const threadPayload = tweets.map((tweetText, idx) => {
          if (idx === 0 && replyToTweetId) {
            return {
              text: tweetText,
              reply: { in_reply_to_tweet_id: replyToTweetId },
            };
          }
          return tweetText;
        });

        const response = await this.client.v2.tweetThread(threadPayload);
        const firstTweetId = response[0].data.id;
        console.log(`✅ Thread posted! First Tweet ID: ${firstTweetId}`);
        return firstTweetId;
      }
    } catch (error) {
      console.error('Error posting tweet:', error);
      return null;
    }
  }
}

export const twitterService = new TwitterService();
