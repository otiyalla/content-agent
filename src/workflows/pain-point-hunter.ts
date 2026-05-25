import { twitterService, SocialPost } from '../services/social/twitter.service';
import { redditService } from '../services/social/reddit.service';
import { llmService } from '../services/llm.service';
import { emailService } from '../services/email.service';

const SEARCH_QUERIES = [
  'blew my account forex',
  'stop loss hit again',
  'risk to reward ratio hard',
  'revenge trading forex',
];

const SUBREDDITS = ['Forex', 'Daytrading'];

async function runHunter() {
  console.log('🔍 Starting Pain Point Hunter Workflow...');

  const allPosts: SocialPost[] = [];

  // 1. Gather posts from Twitter
  for (const query of SEARCH_QUERIES) {
    console.log(`Searching Twitter for: "${query}"`);
    const twitterPosts = await twitterService.searchPainPoints(query, 3);
    allPosts.push(...twitterPosts);
  }

  // 2. Gather posts from Reddit
  for (const query of SEARCH_QUERIES) {
    for (const sub of SUBREDDITS) {
      console.log(`Searching Reddit (r/${sub}) for: "${query}"`);
      const redditPosts = await redditService.searchPainPoints(sub, query, 2);
      allPosts.push(...redditPosts);
    }
  }

  console.log(`Found ${allPosts.length} total posts to analyze.`);

  // 3. Analyze and act on each post
  for (const post of allPosts) {
    console.log(`\nAnalyzing post from ${post.platform} (Author: ${post.authorId})...`);
    console.log(`Content Snippet: ${post.content.substring(0, 100)}...`);

    try {
      const analysis = await llmService.analyzePainPoint(post.content);

      if (analysis.isSolvableByZenlot && analysis.draftResponse) {
        console.log(`💡 Solvable! Drafting reply...`);
        console.log(`Draft: ${analysis.draftResponse}`);
        
        if (post.platform === 'twitter') {
          await twitterService.postTweet(analysis.draftResponse, post.id);
        } else if (post.platform === 'reddit') {
          await redditService.replyToPost(post.id, analysis.draftResponse);
        }
      } else if (!analysis.isSolvableByZenlot && analysis.featureRequest) {
        console.log(`📝 Not solvable. Sending feature request to product team...`);
        await emailService.sendFeatureRequest(
          post.content,
          analysis.featureRequest,
          post.platform,
          post.url
        );
      } else {
        console.log(`⏩ Skipping. (Explanation: ${analysis.explanation})`);
      }
    } catch (error) {
      console.error(`Error processing post ${post.id}:`, error);
    }
  }

  console.log('\n✅ Pain Point Hunter Workflow complete.');
}

// Execute if run directly
if (require.main === module) {
  runHunter().catch(console.error);
}
