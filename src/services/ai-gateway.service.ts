import { AIProviderService, AIRequest, AIResponse, AIProviderConfig } from './ai-provider.service';
import { getUserPlanEntitlements } from './plan.service';
import { UsageService } from './usage.service';
import { PlanTier } from '../types';

export interface AIGatewayConfig {
  userId: string;
  task: 'generation' | 'editing' | 'seo' | 'analysis' | 'qa';
  planTier: PlanTier;
}

export interface AIGatewayResponse extends AIResponse {
  gatewayMetadata: {
    provider: string;
    model: string;
    task: string;
    planTier: PlanTier;
    cost: number;
    latency: number;
    cached: boolean;
  };
}

/**
 * Model configuration by plan tier and task
 */
export const MODEL_CONFIGS = {
  free: {
    generation: { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 },
    editing: { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 1024 },
    seo: { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 1024 },
    analysis: { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 512 },
    qa: { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 512 },
  },
  business: {
    generation: { provider: 'gemini', model: 'gemini-pro', maxTokens: 4096 },
    editing: { provider: 'gemini', model: 'gemini-pro', maxTokens: 2048 },
    seo: { provider: 'gemini', model: 'gemini-pro', maxTokens: 2048 },
    analysis: { provider: 'groq', model: 'llama-3.1-70b-versatile', maxTokens: 1024 },
    qa: { provider: 'groq', model: 'llama-3.1-70b-versatile', maxTokens: 1024 },
  },
  pro: {
    generation: { provider: 'openrouter', model: 'openai/gpt-4', maxTokens: 8192 },
    editing: { provider: 'openrouter', model: 'openai/gpt-4', maxTokens: 4096 },
    seo: { provider: 'openrouter', model: 'openai/gpt-4', maxTokens: 4096 },
    analysis: { provider: 'gemini', model: 'gemini-pro', maxTokens: 2048 },
    qa: { provider: 'gemini', model: 'gemini-pro', maxTokens: 2048 },
  },
};

/**
 * Cost per 1K tokens by provider and model
 */
export const COST_CONFIGS = {
  gemini: {
    'gemini-pro': { input: 0.00025, output: 0.0005 }, // per 1K tokens
  },
  groq: {
    'llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
    'llama-3.1-70b-versatile': { input: 0.00059, output: 0.00079 },
  },
  openrouter: {
    'openai/gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
  },
};

/**
 * AI Gateway Service
 * Central routing for all AI requests with plan-based model selection
 */
export class AIGatewayService {
  /**
   * Get model configuration for user and task
   */
  static getModelConfig(planTier: PlanTier, task: string) {
    const planConfigs = MODEL_CONFIGS[planTier] || MODEL_CONFIGS.free;
    return planConfigs[task as keyof typeof planConfigs] || planConfigs.generation;
  }

  /**
   * Calculate cost for AI request
   */
  static calculateCost(provider: string, model: string, usage: { promptTokens: number; completionTokens: number }): number {
    const providerCosts = COST_CONFIGS[provider as keyof typeof COST_CONFIGS];
    if (!providerCosts) return 0;

    const modelCosts = providerCosts[model as keyof typeof providerCosts];
    if (!modelCosts) return 0;

    const inputCost = (usage.promptTokens / 1000) * modelCosts.input;
    const outputCost = (usage.completionTokens / 1000) * modelCosts.output;

    return inputCost + outputCost;
  }

  /**
   * Check if user can make AI request
   */
  static async canMakeAIRequest(userId: string, planTier: PlanTier): Promise<boolean> {
    const entitlements = await getUserPlanEntitlements(userId);
    const todayAIRequests = await UsageService.getTodayAIRequests(userId);

    return todayAIRequests < entitlements.max_ai_requests_per_day;
  }

  /**
   * Make AI request through gateway
   */
  static async makeRequest(
    config: AIGatewayConfig,
    request: AIRequest
  ): Promise<AIGatewayResponse> {
    // Check if user can make request
    const canMake = await this.canMakeAIRequest(config.userId, config.planTier);
    if (!canMake) {
      throw new Error('AI request limit reached for today');
    }

    // Get model configuration
    const modelConfig = this.getModelConfig(config.planTier, config.task);

    // Get available providers
    const providers = AIProviderService.getAvailableProviders();
    const provider = providers.find(p => p.provider === modelConfig.provider);

    if (!provider) {
      // Fallback to first available provider
      if (providers.length === 0) {
        throw new Error('No AI providers configured');
      }
      
      const fallbackProvider = providers[0];
      return this.makeRequestWithProvider(config, request, fallbackProvider, modelConfig);
    }

    return this.makeRequestWithProvider(config, request, provider, modelConfig);
  }

  /**
   * Make request with specific provider
   */
  private static async makeRequestWithProvider(
    config: AIGatewayConfig,
    request: AIRequest,
    provider: AIProviderConfig,
    modelConfig: any
  ): Promise<AIGatewayResponse> {
    const startTime = Date.now();

    try {
      // Enhance request with model config
      const enhancedRequest: AIRequest = {
        ...request,
        maxTokens: modelConfig.maxTokens,
      };

      // Call provider
      const response = await AIProviderService.callProvider(provider, enhancedRequest);

      // Calculate cost
      const cost = this.calculateCost(
        provider.provider,
        response.model,
        response.usage || { promptTokens: 0, completionTokens: 0 }
      );

      const latency = Date.now() - startTime;

      // Track usage
      await UsageService.trackEvent(
        config.userId,
        'ai_request',
        {
          provider: provider.provider,
          model: response.model,
          task: config.task,
          tokens: response.usage?.totalTokens || 0,
          cost,
          latency,
        }
      );

      return {
        ...response,
        cost,
        latency,
        gatewayMetadata: {
          provider: provider.provider,
          model: response.model,
          task: config.task,
          planTier: config.planTier,
          cost,
          latency,
          cached: false,
        },
      };
    } catch (error) {
      console.error('AI Gateway error:', error);
      throw error;
    }
  }

  /**
   * Generate website code from blueprint
   */
  static async generateWebsite(
    userId: string,
    planTier: PlanTier,
    blueprint: any,
    businessProfile: any
  ): Promise<AIGatewayResponse> {
    const prompt = this.buildGenerationPrompt(blueprint, businessProfile);

    return this.makeRequest(
      { userId, task: 'generation', planTier },
      {
        prompt,
        systemPrompt: 'You are an expert web developer. Generate clean, modern, responsive React/Next.js code based on the blueprint provided. Return only the code, no explanations.',
        temperature: 0.7,
        responseFormat: 'text',
      }
    );
  }

  /**
   * Edit website based on user request
   */
  static async editWebsite(
    userId: string,
    planTier: PlanTier,
    currentCode: string,
    editRequest: string,
    blueprint: any
  ): Promise<AIGatewayResponse> {
    const prompt = this.buildEditPrompt(currentCode, editRequest, blueprint);

    return this.makeRequest(
      { userId, task: 'editing', planTier },
      {
        prompt,
        systemPrompt: 'You are an expert web developer. Apply the requested changes to the existing code. Return only the modified code, no explanations.',
        temperature: 0.5,
        responseFormat: 'text',
      }
    );
  }

  /**
   * Generate SEO optimization
   */
  static async optimizeSEO(
    userId: string,
    planTier: PlanTier,
    websiteContent: string,
    keywords: string[]
  ): Promise<AIGatewayResponse> {
    const prompt = this.buildSEOPrompt(websiteContent, keywords);

    return this.makeRequest(
      { userId, task: 'seo', planTier },
      {
        prompt,
        systemPrompt: 'You are an SEO expert. Optimize the website content for search engines. Return structured SEO recommendations.',
        temperature: 0.3,
        responseFormat: 'json',
      }
    );
  }

  /**
   * Build generation prompt
   */
  private static buildGenerationPrompt(blueprint: any, businessProfile: any): string {
    return `
Generate a complete website based on the following blueprint and business profile:

## Business Profile:
${JSON.stringify(businessProfile, null, 2)}

## Blueprint:
${JSON.stringify(blueprint, null, 2)}

## Requirements:
- Generate React/Next.js components
- Include all pages from the blueprint
- Implement responsive design
- Use the design tokens provided
- Include proper SEO meta tags
- Ensure accessibility compliance

Return the complete code structure with all necessary files.
    `.trim();
  }

  /**
   * Build edit prompt
   */
  private static buildEditPrompt(currentCode: string, editRequest: string, blueprint: any): string {
    return `
Apply the following changes to the existing website code:

## Current Code:
${currentCode}

## Edit Request:
${editRequest}

## Blueprint Context:
${JSON.stringify(blueprint, null, 2)}

## Instructions:
- Apply only the requested changes
- Maintain existing functionality
- Ensure code quality and best practices
- Return the complete modified code
    `.trim();
  }

  /**
   * Build SEO prompt
   */
  private static buildSEOPrompt(websiteContent: string, keywords: string[]): string {
    return `
Optimize the following website content for SEO:

## Website Content:
${websiteContent}

## Target Keywords:
${keywords.join(', ')}

## Tasks:
1. Generate optimized title tags
2. Create meta descriptions
3. Suggest heading structure
4. Recommend keyword placement
5. Provide internal linking suggestions
6. Generate Open Graph tags

Return a JSON object with all SEO recommendations.
    `.trim();
  }

  /**
   * Get AI usage statistics
   */
  static async getUsageStats(userId: string, days = 30) {
    return UsageService.getUserUsageStats(userId, days);
  }

  /**
   * Check provider health
   */
  static async checkProviderHealth(): Promise<Record<string, boolean>> {
    const providers = AIProviderService.getAvailableProviders();
    const health: Record<string, boolean> = {};

    for (const provider of providers) {
      health[provider.provider] = await AIProviderService.testProvider(provider);
    }

    return health;
  }
}
