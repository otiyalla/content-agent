import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API Key is required"),
  OPENAI_API_KEY: z.string().optional(),
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

  DRY_RUN: z.string().default('true').transform((val) => val === 'true'),
});

// Validate process.env against schema
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', parseResult.error.format());
  process.exit(1);
}

export const env = parseResult.data;
