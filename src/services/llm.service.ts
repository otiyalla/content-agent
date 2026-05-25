import OpenAI from 'openai';
import { env } from '../config/env';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export interface PainPointAnalysis {
  isSolvableByZenlot: boolean;
  explanation: string;
  draftResponse?: string;
  featureRequest?: string;
}

export class LLMService {
  /**
   * Analyzes a social media post/comment to determine if Zenlot solves the user's problem.
   * Zenlot is a risk management app for forex traders.
   */
  async analyzePainPoint(postContent: string): Promise<PainPointAnalysis> {
    const prompt = `
You are an expert forex trader and product manager for "Zenlot", a risk management app for forex traders.
Your task is to analyze a social media post from a trader experiencing a problem, and determine if Zenlot can solve it.

Zenlot's core features:
- Tracking risk-to-reward ratios
- Help forex traders define risk rules
- Setting hard stop losses (calculating position size based on risk %)
- Journaling trades and analyzing performance (win rate, profitability)
- Log trades quickly
- Attach journal notes
- Monitor open trades
- Review trade history
- Analyze weekly/monthly performance.


Social Media Post:
"${postContent}"

Determine if Zenlot can solve this problem.
Respond in JSON format with the following structure:
{
  "isSolvableByZenlot": boolean,
  "explanation": "Brief explanation of why it is or isn't solvable.",
  "draftResponse": "If solvable, a helpful, empathetic, non-spammy reply to the user mentioning how Zenlot helps.",
  "featureRequest": "If not solvable, a brief feature request description we can send to our product team."
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-05-13',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const resultText = response.choices[0].message.content || '{}';
    return JSON.parse(resultText) as PainPointAnalysis;
  }

  /**
   * Generates an educational social media post about risk management.
   */
  async generateEducationalPost(topic: string, marketContext?: string): Promise<string> {
    const prompt = `
You are an expert forex trader running the social media account for "Zenlot", a risk management app.
Write an engaging, insightful social media post (e.g., for X/Twitter) about the following topic:
"${topic}"

${marketContext ? `Recent market context to draw inspiration from:\n${marketContext}` : ''}

Guidelines:
- Keep it under 280 characters if possible, or format as a short thread (use 🧵).
- Be contrarian but logical.
- Use a hook.
- Mention the importance of risk management (subtly plugging Zenlot is fine, but focus on value).
- Do not use hashtags or cringe emojis. Keep it professional and sleek.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-05-13',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  }
}

export const llmService = new LLMService();
