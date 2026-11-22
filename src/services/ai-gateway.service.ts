import { AIProviderService, AIRequest, AIResponse, AIProviderConfig } from './ai-provider.service';
import { getUserPlanEntitlements } from './plan.service';
import { UsageService } from './usage.service';
import { PlanTier } from '../types';

export type AITask = 'planning' | 'generation' | 'editing' | 'seo' | 'analysis' | 'qa';

export interface AIGatewayConfig {
  userId: string;
  task: AITask;
  planTier: PlanTier;
}

export interface ModelCandidate {
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
  maxTokens: number;
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
 * Model chains by plan tier and task.
 * Each task is an ordered list of candidates — the gateway tries each in
 * order until one succeeds, so paid tiers degrade gracefully instead of failing.
 * 'planning' = peak reasoning model produces the Blueprint/plan (JSON);
 * 'generation'/'editing' = peak coding model executes it.
 */
export const MODEL_CONFIGS: Record<PlanTier, Record<AITask, ModelCandidate[]>> = {
  free: {
    planning: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 2048 },
    ],
    generation: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 4096 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 4096 },
    ],
    editing: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 2048 },
    ],
    seo: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 1024 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 1024 },
    ],
    analysis: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 1024 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 1024 },
    ],
    qa: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 1024 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', maxTokens: 1024 },
    ],
  },
  business: {
    planning: [
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 4096 },
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    generation: [
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 8192 },
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 8192 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 8192 },
    ],
    editing: [
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 4096 },
      { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    seo: [
      { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 4096 },
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    analysis: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 2048 },
      { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 2048 },
    ],
    qa: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 2048 },
      { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 2048 },
    ],
  },
  pro: {
    planning: [
      { provider: 'openrouter', model: 'openai/o3', maxTokens: 4096 },
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    generation: [
      { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5', maxTokens: 8192 },
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 8192 },
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 8192 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 8192 },
    ],
    editing: [
      { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5', maxTokens: 4096 },
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 4096 },
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    seo: [
      { provider: 'openrouter', model: 'openai/gpt-4o', maxTokens: 4096 },
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 4096 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 4096 },
    ],
    analysis: [
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 2048 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 2048 },
    ],
    qa: [
      { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 2048 },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 2048 },
    ],
  },
};

/**
 * Cost per 1K tokens by provider and model (USD)
 */
export const COST_CONFIGS: Record<string, Record<string, { input: number; output: number }>> = {
  gemini: {
    'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 },
    'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
    'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  },
  groq: {
    'llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
    'llama-3.1-70b-versatile': { input: 0.00059, output: 0.00079 },
    'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  },
  openrouter: {
    'openai/gpt-4o': { input: 0.0025, output: 0.01 },
    'openai/o3': { input: 0.002, output: 0.008 },
    'anthropic/claude-sonnet-4.5': { input: 0.003, output: 0.015 },
  },
};

/**
 * AI Gateway Service
 * Central routing for all AI requests with plan-based model selection
 */
export class AIGatewayService {
  /**
   * Get ordered model candidates for user and task
   */
  static getModelCandidates(planTier: PlanTier, task: AITask): ModelCandidate[] {
    const planConfigs = MODEL_CONFIGS[planTier] || MODEL_CONFIGS.free;
    return planConfigs[task] || planConfigs.generation;
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
  static async canMakeAIRequest(userId: string, _planTier: PlanTier): Promise<boolean> {
    const entitlements = await getUserPlanEntitlements(userId);

    if (entitlements.max_ai_requests_per_day === -1) {
      return true; // unlimited
    }

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

    // Get ordered model candidates for this plan/task
    const candidates = this.getModelCandidates(config.planTier, config.task);

    // Get configured providers once
    const providers = AIProviderService.getAvailableProviders();

    const errors: string[] = [];

    for (const candidate of candidates) {
      const provider = providers.find(p => p.provider === candidate.provider);
      if (!provider) {
        errors.push(`${candidate.provider}/${candidate.model}: provider not configured`);
        continue;
      }

      try {
        return await this.makeRequestWithProvider(config, request, provider, candidate);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${candidate.provider}/${candidate.model}: ${message}`);
        console.error(`AI candidate failed, trying fallback: ${candidate.provider}/${candidate.model} — ${message}`);
      }
    }

    throw new Error(`All AI providers failed for task '${config.task}': ${errors.join(' | ')}`);
  }

  /**
   * Make request with specific provider
   */
  private static async makeRequestWithProvider(
    config: AIGatewayConfig,
    request: AIRequest,
    provider: AIProviderConfig,
    modelConfig: ModelCandidate
  ): Promise<AIGatewayResponse> {
    const startTime = Date.now();

    try {
      // Enhance request with model config
      const enhancedRequest: AIRequest = {
        ...request,
        model: modelConfig.model,
        maxTokens: modelConfig.maxTokens,
      };

      // Call provider
      const response = await AIProviderService.callProvider(provider, enhancedRequest);

      // Validate structured output when JSON was requested
      if (request.responseFormat === 'json' && response.content) {
        try {
          JSON.parse(response.content);
        } catch {
          throw new Error(`AI provider returned invalid JSON for task '${config.task}'`);
        }
      }

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
   * Generate a website plan/Blueprint (planner role — peak reasoning model)
   * Returns structured JSON describing sitemap, pages, design, and content plan.
   */
  static async generateBlueprintPlan(
    userId: string,
    planTier: PlanTier,
    brief: string,
    businessProfile?: any
  ): Promise<AIGatewayResponse> {
    const prompt = this.buildPlanningPrompt(brief, businessProfile);

    return this.makeRequest(
      { userId, task: 'planning', planTier },
      {
        prompt,
        systemPrompt: 'You are an expert web architect and planner. Produce a detailed, structured website blueprint as JSON only. No markdown, no explanations.',
        temperature: 0.4,
        responseFormat: 'json',
      }
    );
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
        systemPrompt: 'You are an expert Next.js/React developer. Generate a complete, production-quality website as a JSON file map. Return JSON only, no markdown fences, no explanations.',
        temperature: 0.4,
        responseFormat: 'json',
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
        systemPrompt: 'You are an expert Next.js/React developer. Apply the requested changes to the existing file map and return the complete updated file map as JSON only. No markdown fences, no explanations.',
        temperature: 0.3,
        responseFormat: 'json',
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
   * Build planning prompt (planner role)
   */
  private static buildPlanningPrompt(brief: string, businessProfile?: any): string {
    return `
Create a website blueprint for the following project:

## Business Brief:
${brief}

${businessProfile ? `## Business Profile:\n${JSON.stringify(businessProfile, null, 2)}\n` : ''}
## Required Blueprint Schema (JSON only):
{
  "sitemap": {
    "pages": [
      { "id": "home", "title": "Home", "slug": "home", "path": "/", "order": 1 }
    ],
    "navigation": [
      { "id": "nav-home", "label": "Home", "path": "/", "order": 1 }
    ]
  },
  "pages": [
    {
      "id": "home",
      "title": "Home",
      "slug": "home",
      "sections": [
        { "id": "hero", "type": "hero", "component_id": "HeroSection", "props": {}, "order": 1 }
      ],
      "seo_title": "...",
      "seo_description": "..."
    }
  ],
  "design_tokens": {
    "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
    "typography": { "font_family": "font-name", "font_sizes": { "h1": "...", "body": "..." } },
    "spacing": { "section": "...", "container": "..." },
    "border_radius": "..."
  },
  "components": [
    { "id": "HeroSection", "name": "HeroSection", "version": "1.0.0", "props_schema": {} }
  ],
  "content_plan": {
    "pages": {
      "home": { "headline": "...", "subheadline": "...", "sections_content": {} }
    }
  },
  "seo_fields": {
    "title": "...",
    "description": "...",
    "keywords": ["kw1", "kw2"]
  },
  "integrations": [],
  "constraints": {}
}

Rules:
- Always include Home, About, Contact pages plus any pages the brief requires
- sitemap.pages, pages, navigation, and components must have matching ids/paths
- Keep it realistic for a small business website
- Valid JSON only
    `.trim();
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

## Output Format (JSON only):
{
  "files": {
    "package.json": "{ ... }",
    "next.config.js": "...",
    "src/app/layout.tsx": "...",
    "src/app/globals.css": "...",
    "src/app/page.tsx": "...",
    "src/app/about/page.tsx": "...",
    "src/app/contact/page.tsx": "...",
    "src/components/Nav.tsx": "...",
    "src/components/Footer.tsx": "..."
  }
}

## Requirements:
- Valid JSON object with a "files" key mapping relative file paths to file contents
- Next.js App Router, React, TypeScript, Tailwind CSS
- Include all pages from the blueprint sitemap
- Responsive design using the blueprint design_tokens
- SEO meta tags via Next.js metadata API
- Realistic placeholder content from the content_plan (no lorem ipsum)
- No external API calls or secrets in generated code
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

## Output Format (JSON only):
{
  "files": {
    "relative/path": "complete updated file content",
    "...": "..."
  }
}

## Instructions:
- Return the COMPLETE file map with all files (not just changed ones)
- Apply only the requested changes
- Maintain existing functionality and file structure
- Keep Next.js App Router + TypeScript + Tailwind conventions
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
