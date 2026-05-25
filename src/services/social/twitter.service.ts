import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';
import { env } from '../../config/env';

export interface SocialPost {
  id: string;
  authorId: string;
  content: string;
  url: string;
  platform: 'twitter' | 'reddit';
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
   * Splits a long text into multiple tweets of at most 280 characters.
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
