import { redditService, SUBREDDIT_TIERS } from '../services/social/reddit.service';
import { llmService } from '../services/llm.service';

// ---------------------------------------------------------------------------
// Reddit Community Builder workflow
//
// Implements the 4-phase Reddit Community Builder strategy:
//   Phase 1 — Monitor: hot posts in primary subreddits
//   Phase 2 — Engage: reply to high-value discussions with genuine insight
//   Phase 3 — Create: post one educational piece per run (pure value, no promo)
//   Phase 4 — Health: log karma to track trusted contributor progress
//
// Developer Advocate: all replies naturally disclose Zenlot affiliation.
// Never astroturf. 90/10 rule enforced in the LLM prompt.
// ---------------------------------------------------------------------------

// Score threshold for engaging with hot posts (1-10)
const HOT_POST_ENGAGE_THRESHOLD = 6;

// Max engagements per run — respect Reddit rate limits and avoid spam
const MAX_ENGAGEMENTS_PER_RUN = 3;

// Educational topic rotation — pure value content, zero promotion
// Reddit Community Builder: educational series builds karma and trust over time
const EDUCATIONAL_TOPICS = [
  'Why your stop-loss placement is costing you more than your losses',
  'The position sizing formula that changed how I manage risk',
  'How to journal trades so you actually learn from them',
  'Revenge trading: the psychological loop and how to break it',
  'Risk-to-reward ratio is not what most traders think it is',
  'Why most "risk 1% per trade" advice is incomplete',
  'How to set a max daily loss rule you will actually follow',
  'What your win rate doesn\'t tell you about your profitability',
];

function pickEducationalTopic(): string {
  // Rotate topics deterministically by day of month so the same topic
  // doesn't repeat on back-to-back runs
  const dayIndex = new Date().getDate() % EDUCATIONAL_TOPICS.length;
  return EDUCATIONAL_TOPICS[dayIndex];
}

async function runRedditCommunity() {
  console.log('🤝 Starting Reddit Community Workflow...');

  let engagementsPosted = 0;

  // ── Phase 1 & 2: Monitor hot posts + engage ──────────────────────────────
  console.log('\n[Phase 1-2] Monitoring hot posts in primary subreddits...');

  const hotOpportunities: Array<{
    post: Awaited<ReturnType<typeof redditService.getHotPosts>>[number];
    subreddit: string;
    score: number;
    reply: string;
  }> = [];

  for (const subreddit of SUBREDDIT_TIERS.primary) {
    if (engagementsPosted >= MAX_ENGAGEMENTS_PER_RUN) break;

    console.log(`  Checking r/${subreddit} hot posts...`);
    const hotPosts = await redditService.getHotPosts(subreddit, 8);

    for (const post of hotPosts) {
      if (!post.content.trim()) continue; // skip link posts with no text

      const scored = await llmService.scoreEngagementOpportunity(
        post.content,
        post.upvotes,
      );

      console.log(`  [${scored.score}/10] "${post.content.substring(0, 80)}..."`);

      if (scored.score >= HOT_POST_ENGAGE_THRESHOLD && scored.addedValueReply) {
        // Scored high on Twitter engager scoring — but Reddit needs a longer reply
        // Generate a proper Reddit-native long-form reply
        const redditReply = await llmService.generateRedditReply(
          post.content,
          subreddit,
          post.postTitle,
        );

        if (redditReply) {
          hotOpportunities.push({ post, subreddit, score: scored.score, reply: redditReply });
        }
      }
    }
  }

  // Sort by score and engage with top opportunities
  hotOpportunities.sort((a, b) => b.score - a.score);

  for (const { post, subreddit, score, reply } of hotOpportunities) {
    if (engagementsPosted >= MAX_ENGAGEMENTS_PER_RUN) break;

    console.log(`\n  💬 Engaging with r/${subreddit} post (score: ${score})`);
    console.log(`  Post: "${post.content.substring(0, 100)}..."`);
    console.log(`  Reply preview: "${reply.substring(0, 120)}..."`);

    await redditService.replyToPost(post.id, reply);

    // 90/10 rule: upvote other high-quality posts in the thread as a community act
    await redditService.upvotePost(post.id);

    engagementsPosted++;
  }

  console.log(`\n  Engaged with ${engagementsPosted} hot post(s).`);

  // ── Phase 3: Post educational content ────────────────────────────────────
  // Reddit Community Builder: one educational post per run in the most relevant
  // subreddit. 100% value, zero promotion. Builds karma and trusted status.
  console.log('\n[Phase 3] Creating educational post...');

  const topic = pickEducationalTopic();
  const targetSubreddit = SUBREDDIT_TIERS.primary[0]; // r/Forex — primary audience
  console.log(`  Topic: "${topic}" → r/${targetSubreddit}`);

  const educationalPost = await llmService.generateRedditEducationalPost(
    topic,
    targetSubreddit,
  );

  if (educationalPost.title && educationalPost.body) {
    console.log(`  Title: "${educationalPost.title}"`);
    console.log(`  Estimated engagement: ${educationalPost.estimatedEngagement}`);

    if (educationalPost.estimatedEngagement === 'low') {
      console.log('  ⚠️  Low estimated engagement — skipping post. Consider a different topic.');
    } else {
      await redditService.createPost(targetSubreddit, educationalPost.title, educationalPost.body);
    }
  } else {
    console.log('  ⚠️  Failed to generate educational post content.');
  }

  // ── Phase 4: Karma health check ──────────────────────────────────────────
  // Reddit Community Builder target: 10,000+ combined karma for trusted status
  // Low karma (<1,000) = reduced visibility; log a warning
  console.log('\n[Phase 4] Checking account karma...');

  const karma = await redditService.getUserKarma();
  if (karma) {
    const { linkKarma, commentKarma, total } = karma;
    console.log(`  Link karma: ${linkKarma.toLocaleString()} | Comment karma: ${commentKarma.toLocaleString()} | Total: ${total.toLocaleString()}`);

    if (total < 1_000) {
      console.warn('  ⚠️  Karma below 1,000 — posts may have reduced visibility. Focus on high-quality comments before creating posts.');
    } else if (total < 5_000) {
      console.log('  📈 Karma building (target: 10,000+ for trusted contributor status).');
    } else if (total >= 10_000) {
      console.log('  ✅ Trusted contributor karma threshold reached.');
    }
  } else {
    console.log('  (karma check skipped — mock mode)');
  }

  console.log('\n✅ Reddit Community Workflow complete.');
}

if (require.main === module) {
  runRedditCommunity().catch(console.error);
}
