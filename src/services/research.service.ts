import { tavily } from '@tavily/core';
import { env } from '../config/env';

export class ResearchService {
  private tvly: ReturnType<typeof tavily> | null = null;

  constructor() {
    if (env.TAVILY_API_KEY) {
      this.tvly = tavily({ apiKey: env.TAVILY_API_KEY });
    } else {
      console.warn('⚠️ TAVILY_API_KEY is not set. Research service will return empty context.');
    }
  }

  /**
   * Searches the web for current trends, news, or context regarding a specific forex topic.
   */
  async getMarketContext(topic: string): Promise<string> {
    if (!this.tvly) return '';

    try {
      const response = await this.tvly.search(topic, {
        searchDepth: 'basic',
        includeAnswer: true,
        maxResults: 3,
      });

      return response.answer || response.results.map((r) => r.content).join('\n') || '';
    } catch (error) {
      console.error('Error fetching market context from Tavily:', error);
      return '';
    }
  }
}

export const researchService = new ResearchService();
