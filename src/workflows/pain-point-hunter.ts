import { twitterService, SocialPost } from '../services/social/twitter.service';
import { redditService, SUBREDDIT_TIERS } from '../services/social/reddit.service';
import { llmService } from '../services/llm.service';
import { emailService } from '../services/email.service';

// Seed queries — expanded dynamically by Claude each run
const SEED_QUERIES = [
  'blew my account forex',
  'stop loss hit again',
  'risk to reward ratio hard',
  'revenge trading forex',
  'position size too big',
  'wiped account trading',
];

// All subreddits across tiers — primary + secondary + niche
const ALL_SUBREDDITS = [
  ...SUBREDDIT_TIERS.primary,
  ...SUBREDDIT_TIERS.secondary,
  ...SUBREDDIT_TIERS.niche,
];

// Engagement score threshold for replying — below this, skip the reply
const ENGAGEMENT_SCORE_THRESHOLD = 5;

// Max social replies per run (Twitter + Reddit combined)
const MAX_REPLIES_PER_RUN = 5;

// Minimum Reddit upvotes to bother analyzing — filters out noise
const MIN_REDDIT_UPVOTES = 1;

// Collect unsolvable posts for end-of-run batch synthesis
const unsolvablePosts: { content: string; platform: string; url: string }[] = [];

async function runHunter() {
  console.log('🔍 Starting Pain Point Hunter Workflow...');

  // Expand search queries dynamically via Claude
  console.log('Generating dynamic search queries...');
  const dynamicQueries = await llmService.generateSearchQueries(SEED_QUERIES);
  const allQueries = [...new Set([...SEED_QUERIES, ...dynamicQueries])];
  console.log(`Using ${allQueries.length} queries (${dynamicQueries.length} generated)`);

  const allPosts: SocialPost[] = [];

  // ── Twitter ──────────────────────────────────────────────────────────────
  for (const query of allQueries) {
    console.log(`Searching Twitter: "${query}"`);
    const posts = await twitterService.searchPainPoints(query, 3);
    allPosts.push(...posts);
  }

  // ── Reddit: submissions + comments ───────────────────────────────────────
  // Primary subreddits get both submission search and comment search
  // Secondary/niche get submission search only (keep run time manageable)
  for (const sub of SUBREDDIT_TIERS.primary) {
    for (const query of SEED_QUERIES) {
      const posts = await redditService.searchPainPoints(sub, query, 3);
      allPosts.push(...posts.filter((p) => (p.upvotes ?? 0) >= MIN_REDDIT_UPVOTES));

      // Comment-level search — catches pain expressed in discussion replies
      const comments = await redditService.searchComments(sub, query, 2);
      allPosts.push(...comments.filter((p) => (p.upvotes ?? 0) >= MIN_REDDIT_UPVOTES));
    }
  }

  for (const sub of [...SUBREDDIT_TIERS.secondary, ...SUBREDDIT_TIERS.niche]) {
    for (const query of SEED_QUERIES) {
      const posts = await redditService.searchPainPoints(sub, query, 2);
      allPosts.push(...posts.filter((p) => (p.upvotes ?? 0) >= MIN_REDDIT_UPVOTES));
    }
  }

  // Deduplicate by post ID
  const seen = new Set<string>();
  const uniquePosts = allPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  console.log(`Found ${uniquePosts.length} unique posts to analyze.`);

  // ── Analyze all posts ────────────────────────────────────────────────────
  const analysisResults: Array<{
    post: SocialPost;
    analysis: Awaited<ReturnType<typeof llmService.analyzePainPoint>>;
  }> = [];

  for (const post of uniquePosts) {
    try {
      const analysis = await llmService.analyzePainPoint(post.content);
      analysisResults.push({ post, analysis });
    } catch (error) {
      console.error(`Error analyzing post ${post.id}:`, error);
    }
  }

  // Sort by engagement score — highest ROI replies first
  analysisResults.sort(
    (a, b) => (b.analysis.engagementScore ?? 0) - (a.analysis.engagementScore ?? 0),
  );

  let repliesPosted = 0;

  for (const { post, analysis } of analysisResults) {
    if (repliesPosted >= MAX_REPLIES_PER_RUN) {
      console.log(`Reached max replies (${MAX_REPLIES_PER_RUN}). Stopping.`);
      break;
    }

    const score = analysis.engagementScore ?? 0;
    const isReddit = post.platform === 'reddit';
    console.log(`\n[${post.platform}${isReddit ? ` r/${post.subreddit}` : ''}] Score: ${score} | Author: ${post.authorId}`);
    console.log(`  "${post.content.substring(0, 100)}..."`);

    if (analysis.isSolvableByZenlot) {
      if (score < ENGAGEMENT_SCORE_THRESHOLD) {
        console.log(`  ⏩ Skip — score ${score} below threshold ${ENGAGEMENT_SCORE_THRESHOLD}`);
        continue;
      }

      if (post.platform === 'twitter' && analysis.draftResponse) {
        // Twitter: use the short LLM-drafted reply from analyzePainPoint
        console.log(`  💬 Tweeting reply...`);
        await twitterService.postTweet(analysis.draftResponse, post.id);
        repliesPosted++;
      } else if (isReddit) {
        // Reddit: generate a proper long-form, markdown, value-first reply
        // (Developer Advocate: never use Twitter-length copy on Reddit)
        console.log(`  💬 Generating Reddit reply (long-form)...`);
        const redditReply = await llmService.generateRedditReply(
          post.content,
          post.subreddit ?? 'forex',
          post.postTitle,
        );

        if (redditReply) {
          if (post.isComment) {
            await redditService.replyToComment(post.id, redditReply);
          } else {
            await redditService.replyToPost(post.id, redditReply);
          }
          repliesPosted++;
        }
      }
    } else if (analysis.featureRequest) {
      // Collect for batch synthesis instead of sending one email per post
      console.log(`  📝 Queued for feedback synthesis: ${analysis.featureRequest}`);
      unsolvablePosts.push({ content: post.content, platform: post.platform, url: post.url });
    } else {
      console.log(`  ⏩ Not relevant.`);
    }
  }

  // ── Batch feedback synthesis (Product Feedback Synthesizer) ──────────────
  if (unsolvablePosts.length > 0) {
    console.log(`\n📊 Synthesizing ${unsolvablePosts.length} unsolvable posts into RICE-scored feature requests...`);
    try {
      const synthesized = await llmService.synthesizeFeedback(unsolvablePosts);

      for (const feature of synthesized) {
        const subject = `[Agent Digest] Feature Request: ${feature.title} — RICE ${feature.riceScore.total.toFixed(0)} (${feature.suggestedPriority})`;
        const body = `
RICE Score: ${feature.riceScore.total.toFixed(0)}
  Reach: ${feature.riceScore.reach}/10 | Impact: ${feature.riceScore.impact}/10 | Confidence: ${feature.riceScore.confidence}% | Effort: ${feature.riceScore.effort}w
Priority: ${feature.suggestedPriority.toUpperCase()}
Source: ${feature.source}

Description:
${feature.description}

Supporting Community Quotes:
${feature.supportingQuotes.map((q) => `  • "${q}"`).join('\n')}
        `.trim();

        await emailService.sendFeatureRequest(body, feature.description, feature.source, '');
        console.log(`  ✅ Sent: ${feature.title} (RICE ${feature.riceScore.total.toFixed(0)})`);
      }
    } catch (error) {
      console.error('Error synthesizing feedback:', error);
    }
  }

  console.log(`\n✅ Pain Point Hunter complete. Replied to ${repliesPosted} posts.`);
}

if (require.main === module) {
  runHunter().catch(console.error);
}
