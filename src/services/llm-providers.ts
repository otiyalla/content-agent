import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Provider chain for plain-text / JSON completions:
//
//   1. Anthropic Claude   (primary)
//   2. OpenAI             (first backup)
//   3. xAI Grok           (second backup — OpenAI-compatible API at api.x.ai)
//
// Each provider is tried in order; providers without an API key are skipped.
// Every hop is logged as [LLM_FALLBACK] so outages show up in the Action logs.
// ---------------------------------------------------------------------------

export type ProviderName = 'anthropic' | 'openai' | 'xai';

/** "complex" = writing / judgement tasks, "simple" = short lists and scores. */
export type Tier = 'complex' | 'simple';

export interface CompleteOptions {
  maxTokens: number;
  tier: Tier;
  /** Ask OpenAI-compatible providers for a JSON object response. */
  json?: boolean;
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const OPENAI_MODELS: Record<Tier, string> = { complex: 'gpt-4o', simple: 'gpt-4o-mini' };

// grok-4.7 is xAI's flagship; grok-4.3 is the cheaper 1M-context model.
const XAI_MODELS: Record<Tier, string> = {
  complex: env.XAI_MODEL ?? 'grok-4.7',
  simple: env.XAI_MODEL_SIMPLE ?? 'grok-4.3',
};

const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
const xai = env.XAI_API_KEY ? new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' }) : null;

export const availableBackups: ProviderName[] = [...(openai ? ['openai' as const] : []), ...(xai ? ['xai' as const] : [])];
if (availableBackups.length === 0) {
  console.warn('[LLM] No backup provider configured — set OPENAI_API_KEY and/or XAI_API_KEY for failover.');
}

/** Thrown when every configured provider failed for the same operation. */
export class LLMChainError extends Error {
  constructor(
    public readonly operation: string,
    public readonly errors: Partial<Record<ProviderName, unknown>>,
  ) {
    super(`[LLM_CHAIN_FAILURE] All providers failed for op=${operation}: ${Object.keys(errors).join(', ')}`);
    this.name = 'LLMChainError';
  }
}

async function viaClaude(prompt: string, opts: CompleteOptions): Promise<string> {
  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') throw new Error('Claude declined the request');
  return message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

async function viaOpenAICompatible(client: OpenAI, model: string, prompt: string, opts: CompleteOptions): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens,
    messages: [{ role: 'user', content: prompt }],
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });
  const text = response.choices[0]?.message.content ?? '';
  if (!text.trim()) throw new Error(`${model} returned an empty response`);
  return text;
}

/** One step of the chain: a provider name and how to call it. */
export interface ProviderStep<T> {
  name: ProviderName;
  run: () => Promise<T>;
}

/**
 * Runs steps in order until one succeeds. Use this directly when a provider
 * needs special handling (e.g. Claude structured outputs); otherwise use complete().
 */
export async function runChain<T>(operation: string, steps: ProviderStep<T>[]): Promise<T> {
  const errors: Partial<Record<ProviderName, unknown>> = {};
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const result = await step.run();
      if (i > 0) console.warn(`[LLM_FALLBACK] op=${operation} served_by=${step.name}`);
      return result;
    } catch (err) {
      errors[step.name] = err;
      const reason = err instanceof Error ? err.message : String(err);
      const next = steps[i + 1]?.name;
      console.warn(`[LLM_FALLBACK] op=${operation} provider=${step.name} failed reason="${reason}"${next ? ` → trying ${next}` : ''}`);
    }
  }
  console.error(`[LLM_CHAIN_FAILURE] op=${operation}`);
  throw new LLMChainError(operation, errors);
}

/** The backup providers (OpenAI, then Grok) as chain steps for a given prompt. */
export function backupSteps(prompt: string, opts: CompleteOptions): ProviderStep<string>[] {
  const steps: ProviderStep<string>[] = [];
  if (openai) steps.push({ name: 'openai', run: () => viaOpenAICompatible(openai, OPENAI_MODELS[opts.tier], prompt, opts) });
  if (xai) steps.push({ name: 'xai', run: () => viaOpenAICompatible(xai, XAI_MODELS[opts.tier], prompt, opts) });
  return steps;
}

/** Text completion through the full Claude → OpenAI → Grok chain. */
export function complete(operation: string, prompt: string, opts: CompleteOptions): Promise<string> {
  return runChain(operation, [{ name: 'anthropic', run: () => viaClaude(prompt, opts) }, ...backupSteps(prompt, opts)]);
}
