import { researchService } from '../services/research.service';
import { llmService } from '../services/llm.service';
import { twitterService } from '../services/social/twitter.service';

const TOPICS = [
  'Why most traders misuse risk-to-reward',
  'The hidden psychology behind stop losses',
  'What I learned building a trader risk app',
  'How to stop revenge trading',
  'Why position sizing is more important than win rate',
];

function getRandomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

async function runCreator() {
  console.log('✍️ Starting Content Creator Workflow...');

  // 1. Pick a topic
  const topic = getRandomTopic();
  console.log(`Selected Topic: "${topic}"`);

  // 2. Get current market context (optional, makes it more relevant)
  console.log('Researching current market context...');
  const marketContext = await researchService.getMarketContext('Forex major pairs current trends today');
  if (marketContext) {
    console.log(`Found market context (${marketContext.length} chars)`);
  }

  // 3. Generate the post content
  console.log('Generating content via LLM...');
  const content = await llmService.generateEducationalPost(topic, marketContext);
  
  if (!content) {
    console.error('Failed to generate content.');
    return;
  }

  console.log('\n--- Generated Post ---');
  console.log(content);
  console.log('----------------------\n');

  // 4. Post to social media
  console.log('Publishing to Twitter...');
  await twitterService.postTweet(content);

  console.log('✅ Content Creator Workflow complete.');
}

// Execute if run directly
if (require.main === module) {
  runCreator().catch(console.error);
}
