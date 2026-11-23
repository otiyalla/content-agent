import fs from 'fs';
import path from 'path';
import { twitterService } from '../services/social/twitter.service';
import { llmService } from '../services/llm.service';
import { outbox } from '../services/outbox.service';

// Accounts to reply to live in content/x-targets.json, and only ones a person has vetted recently
// (no signals, no broker referral links, no profit screenshots). A few are picked per run, rotating
// daily, so the account doesn't reply to the same people every day.
const VETTING_MAX_AGE_DAYS = 90;
const ACCOUNTS_PER_RUN = 3;

function vettedTargets(now: Date): string[] {
  const file = path.join(process.cwd(), 'content', 'x-targets.json');
  const { accounts } = JSON.parse(fs.readFileSync(file, 'utf8')) as { accounts: Array<{ handle: string; vettedAt: string }> };
  const fresh = accounts.filter((a) => a.vettedAt && now.getTime() - Date.parse(a.vettedAt) <= VETTING_MAX_AGE_DAYS * 86400_000);
  if (!fresh.length) return [];
  const start = Math.floor(now.getTime() / 86400_000) % fresh.length;
  return Array.from({ length: Math.min(ACCOUNTS_PER_RUN, fresh.length) }, (_, i) => fresh[(start + i) % fresh.length].handle);
}

// Score threshold for engaging — only reply when we can genuinely add value
const ENGAGEMENT_SCORE_THRESHOLD = 6;

// Max engagements per run to stay within rate limits and avoid appearing spammy
const MAX_ENGAGEMENTS_PER_RUN = 3;

async function runCommunityEngager() {
  console.log('🤝 Starting Community Engager Workflow...');
  console.log('Monitoring thought leaders for high-value engagement opportunities...');

  const targets = vettedTargets(new Date());
  if (!targets.length) {
    console.log(`No vetted accounts in content/x-targets.json (vetted in the last ${VETTING_MAX_AGE_DAYS} days). Nothing to do.`);
    return;
  }
  console.log(`Today's accounts: ${targets.map((t) => `@${t}`).join(', ')}`);

  let engagementsPosted = 0;
  const opportunities: Array<{
    post: Awaited<ReturnType<typeof twitterService.getUserRecentTweets>>[number];
    handle: string;
    score: number;
    reply: string;
  }> = [];

  // Gather recent posts from target accounts and score them
  for (const handle of targets) {
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

    await twitterService.postTweet(reply, post.id, { context: `@${handle}: ${post.content}`, score });
    engagementsPosted++;
  }

  console.log(`\n✅ Community Engager complete. Drafted ${engagementsPosted} replies.`);
}

if (require.main === module) {
  // Save held drafts even if the run fails part-way, so nothing is lost.
  runCommunityEngager()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => outbox.save('X community engager'));
}
