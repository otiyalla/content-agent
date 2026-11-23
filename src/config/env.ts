import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API Key is required"),
  OPENAI_API_KEY: z.string().optional(),
  // xAI Grok — second backup LLM after OpenAI
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().optional(), // default grok-4.7
  XAI_MODEL_SIMPLE: z.string().optional(), // default grok-4.3
  TAVILY_API_KEY: z.string().optional(),


  TWITTER_BEARER_TOKEN: z.string().optional(),
  TWITTER_APP_KEY: z.string().optional(),
  TWITTER_APP_SECRET: z.string().optional(),
  TWITTER_ACCESS_TOKEN: z.string().optional(),
  TWITTER_ACCESS_SECRET: z.string().optional(),

  TWITTER_APP_OAuth2_CLIENT_ID: z.string().optional(),
  TWITTER_APP_OAuth2_CLIENT_SECRET: z.string().optional(),
  TWITTER_OAuth2_ACCESS_TOKEN: z.string().optional(),
  TWITTER_OAuth2_REFRESH_TOKEN: z.string().optional(),

  REDDIT_USER_AGENT: z.string().default('ZenlotContentAgent/1.0.0'),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USERNAME: z.string().optional(),
  REDDIT_PASSWORD: z.string().optional(),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.string().transform(Number).default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Zenlot Agent <info@zenlot.net>'),
  EMAIL_TO: z.string().default('info@zenlot.net'),

  // Instagram (Instagram API with Instagram Login — no Facebook Page required)
  IG_USER_ID: z.string().optional(),
  IG_ACCESS_TOKEN: z.string().optional(),
  IG_GRAPH_VERSION: z.string().default('v27.0'),
  IG_API_HOST: z.string().optional(), // override token-based detection: graph.facebook.com | graph.instagram.com
  IG_HANDLE: z.string().default('@zenlot_app'),

  // Cloudflare R2 (public image hosting — Instagram fetches images by URL)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('zenlot-social'),
  R2_PUBLIC_BASE_URL: z.string().optional(), // e.g. https://social.zenlot.net or https://pub-xxxx.r2.dev

  DRY_RUN: z.string().default('true').transform((val) => val === 'true'),
  // X/Reddit only: post without owner approval. Off by default, so drafts are emailed for review.
  AGENTS_AUTOPOST: z.string().default('false').transform((val) => val === 'true'),
});

// Validate process.env against schema
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', parseResult.error.format());
  process.exit(1);
}

export const env = parseResult.data;
