import { twitterService } from '../services/social/twitter.service';
import { llmService } from '../services/llm.service';

// Accounts to monitor and engage with — forex/trading thought leaders and communities
// Add or remove handles based on who is actively posting in your niche
const TARGET_ACCOUNTS = [
  'babypips',
  'forex_jayz',
  'theforexguy',
  'investopedia',
  'financialcontent',
];

// Score threshold for engaging — only reply when we can genuinely add value
const ENGAGEMENT_SCORE_THRESHOLD = 6;

// Max engagements per run to stay within rate limits and avoid appearing spammy
const MAX_ENGAGEMENTS_PER_RUN = 3;

async function runCommunityEngager() {
  console.log('🤝 Starting Community Engager Workflow...');
  console.log('Monitoring thought leaders for high-value engagement opportunities...');

  let engagementsPosted = 0;
  const opportunities: Array<{
    post: Awaited<ReturnType<typeof twitterService.getUserRecentTweets>>[number];
    handle: string;
    score: number;
    reply: string;
  }> = [];

  // Gather recent posts from target accounts and score them
  for (const handle of TARGET_ACCOUNTS) {
    if (engagementsPosted >= MAX_ENGAGEMENTS_PER_RUN) break;

    console.log(`\nChecking @${handle}...`);
    try {
      const posts = await twitterService.getUserRecentTweets(handle, 3);

      for (const post of posts) {
        const scored = await llmService.scoreEngagementOpportunity(post.content);

        console.log(`  Score: ${scored.score}/10 | Reason: ${scored.reason}`);

        if (scored.score >= ENGAGEMENT_SCORE_THRESHOLD && scored.addedValueReply) {
          opportunities.push({ post, handle, score: scored.score, reply: scored.addedValueReply });
        }
      }
    } catch (error) {
      console.error(`Error checking @${handle}:`, error);
    }
  }

  // Sort by score — engage with the highest-value opportunities first
  opportunities.sort((a, b) => b.score - a.score);

  for (const { post, handle, score, reply } of opportunities) {
    if (engagementsPosted >= MAX_ENGAGEMENTS_PER_RUN) {
      console.log(`Reached max engagements (${MAX_ENGAGEMENTS_PER_RUN}).`);
      break;
    }

    console.log(`\n💬 Engaging with @${handle} (score: ${score}):`);
    console.log(`  Original: "${post.content.substring(0, 100)}..."`);
    console.log(`  Reply: "${reply}"`);

    await twitterService.postTweet(reply, post.id);
    engagementsPosted++;
  }

  console.log(`\n✅ Community Engager complete. Posted ${engagementsPosted} replies.`);
}

if (require.main === module) {
  runCommunityEngager().catch(console.error);
}
