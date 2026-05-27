import { researchService } from '../services/research.service';
import { llmService, ContentType } from '../services/llm.service';
import { twitterService } from '../services/social/twitter.service';

// Content mix strategy from Twitter Engager:
// Educational 25% | Personal 20% | Commentary 20% | Engagement 15% | Promotional 10% | Entertainment 10%
const CONTENT_CALENDAR: { type: ContentType; weight: number; topics: string[] }[] = [
  {
    type: 'educational',
    weight: 25,
    topics: [
      'Why most traders misuse risk-to-reward ratios',
      'The hidden psychology behind stop-loss avoidance',
      'Position sizing is more important than your win rate — here is the math',
      'How to build a trading rule set you will actually follow',
      'What your trade journal is telling you that you are ignoring',
      'The compound cost of skipping your stop loss just once',
    ],
  },
  {
    type: 'personal',
    weight: 20,
    topics: [
      'What I learned from talking to traders who blew their accounts',
      'Why we built Zenlot around rules, not predictions',
      'The moment I realized emotional trading has a structural fix',
      'Building a risk app taught me this about trader psychology',
    ],
  },
  {
    type: 'commentary',
    weight: 20,
    topics: [
      'What this week\'s major pair moves reveal about retail positioning',
      'Why most "risk management advice" on Twitter is dangerously incomplete',
      'The revenge trading cycle and why discipline alone does not break it',
      'High win rate traders who are still losing money — a common pattern',
    ],
  },
  {
    type: 'engagement',
    weight: 15,
    topics: [
      'What is your biggest risk management mistake as a new trader?',
      'Do you review your trades weekly? What does your process look like?',
      'Hot take: most traders fail because of position sizing, not strategy. Agree?',
      'What rule do you wish you had set for yourself on your first blown account?',
    ],
  },
  {
    type: 'promotional',
    weight: 10,
    topics: [
      'Zenlot forces you to define your risk before you enter — here is why that changes everything',
      'The one feature in Zenlot that traders say they wish they had on day one',
      'How Zenlot\'s trade journal surfaces patterns you cannot see in the moment',
    ],
  },
  {
    type: 'entertainment',
    weight: 10,
    topics: [
      'The five stages of grief after a stop-loss hit: a field guide',
      'Trader confidence vs account balance: an ongoing tragedy',
      'The mental math every trader does when they are about to size too big',
    ],
  },
];

// Best posting times (EST) aligned to peak forex/finance Twitter activity
const OPTIMAL_POSTING_HOURS = [9, 12, 17, 20]; // 9am, noon, 5pm, 8pm

function selectContentByWeight(): { type: ContentType; topic: string } {
  const total = CONTENT_CALENDAR.reduce((sum, c) => sum + c.weight, 0);
  let rand = Math.random() * total;

  for (const entry of CONTENT_CALENDAR) {
    rand -= entry.weight;
    if (rand <= 0) {
      const topic = entry.topics[Math.floor(Math.random() * entry.topics.length)];
      return { type: entry.type, topic };
    }
  }

  const fallback = CONTENT_CALENDAR[0];
  return { type: fallback.type, topic: fallback.topics[0] };
}

function isOptimalPostingTime(): boolean {
  const hourEST = new Date().getUTCHours() - 4; // rough UTC to EST
  const normalizedHour = ((hourEST % 24) + 24) % 24;
  return OPTIMAL_POSTING_HOURS.some((h) => Math.abs(normalizedHour - h) <= 1);
}

async function runCreator() {
  console.log('✍️ Starting Content Creator Workflow...');

  if (!isOptimalPostingTime()) {
    console.log('⏰ Not an optimal posting time. Consider scheduling for 9am, 12pm, 5pm, or 8pm EST.');
    console.log('   Continuing anyway — override with a scheduler for best results.');
  }

  // Select topic using weighted content mix
  const { type, topic } = selectContentByWeight();
  console.log(`Selected content type: [${type}] — Topic: "${topic}"`);

  // Get market context for relevance (used by educational + commentary types)
  let marketContext: string | undefined;
  if (['educational', 'commentary', 'promotional'].includes(type)) {
    console.log('Researching current market context...');
    marketContext = await researchService.getMarketContext('Forex major pairs risk sentiment today');
    if (marketContext) {
      console.log(`Found market context (${marketContext.length} chars)`);
    }
  }

  // Generate content via Claude with Twitter Engager strategy
  console.log('Generating content via Claude...');
  const generated = await llmService.generatePost(topic, type, marketContext);

  if (!generated.content) {
    console.error('Failed to generate content.');
    return;
  }

  console.log('\n--- Generated Post ---');
  console.log(`Type: ${generated.contentType} | Thread: ${generated.isThread} | Est. engagement: ${generated.estimatedEngagement}`);
  console.log(generated.content);
  console.log('----------------------\n');

  if (generated.estimatedEngagement === 'low') {
    console.log('⚠️  Low estimated engagement. Review content before posting or regenerate.');
  }

  console.log('Publishing to Twitter...');
  await twitterService.postTweet(generated.content);

  console.log(`✅ Content Creator Workflow complete. [${type}]`);
}

if (require.main === module) {
  runCreator().catch(console.error);
}
