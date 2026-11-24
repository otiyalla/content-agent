import { llmService, ContentType } from '../services/llm.service';
import { twitterService } from '../services/social/twitter.service';
import { NFA, X_LIMIT, isThread, outbox } from '../services/outbox.service';
import { ZENLOT_LINKS } from '../config/zenlot';

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
      'I made more mistakes when I traded off my rules than on them. That is why Zenlot exists',
      'My trading journal started as an Excel sheet that kept growing every week',
      'Why a spreadsheet journal stopped working for me (no new features, laptop only, copying sheets by hand)',
      'The feature I use most: seeing roughly what I could gain or lose before I enter',
      'Writing down mistakes so I do not make the same one twice'
    ],
  },
  {
    type: 'commentary',
    weight: 20,
    topics: [
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
      'If you could set one rule for your first year of trading again, what would it be?',
    ],
  },
  {
    type: 'promotional',
    weight: 10,
    topics: [
      'Zenlot asks for your stop-loss and risk before you confirm a trade. Here is why that one step matters',
      'Seeing roughly what you could gain or lose before you enter: the Zenlot feature the founder uses most',
      'A winning trade can still get a "Lucky" verdict in Zenlot. Why judging the process beats judging the outcome',
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

// Some posts point readers to Instagram. Only kinds where a link doesn't get in the way of the post,
// and only about half of those, so the account doesn't read as an advert.
const INSTAGRAM_TYPES: ContentType[] = ['educational', 'personal', 'promotional'];
const INSTAGRAM_SHARE = 0.5;
const INSTAGRAM_LINE = `More trading maths and checklists on Instagram: ${ZENLOT_LINKS.instagram}`;

/** Adds the Instagram line to some posts, if it fits along with the disclaimer. The wording is fixed, never generated. */
export function withInstagram(text: string, type: ContentType, roll = Math.random()): string {
  if (!INSTAGRAM_TYPES.includes(type) || roll >= INSTAGRAM_SHARE || /instagram/i.test(text)) return text;
  const added = `${text.trim()}\n\n${INSTAGRAM_LINE}`;
  const full = /not financial advice/i.test(added) ? added : `${added}\n\n${NFA}`;
  return isThread(text) || full.length <= X_LIMIT ? added : text;
}

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

  // No live market news in prompts: it invites market calls. Education uses maths you can show.
  const marketContext: string | undefined = undefined;

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

  const content = withInstagram(generated.content, type);
  if (content !== generated.content) console.log('🔗 Added the Instagram line.');

  if (generated.estimatedEngagement === 'low') {
    console.log('⚠️  Low estimated engagement. Review content before posting or regenerate.');
  }

  console.log('Publishing to Twitter...');
  await twitterService.postTweet(content);

  console.log(`✅ Content Creator Workflow complete. [${type}]`);
}

if (require.main === module) {
  // Save held drafts even if the run fails part-way, so nothing is lost.
  runCreator()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => outbox.save('X content creator'));
}
