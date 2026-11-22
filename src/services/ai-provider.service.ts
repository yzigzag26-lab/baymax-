import { config } from '../config';

export interface AIProviderConfig {
  provider: 'gemini' | 'groq' | 'openrouter';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number;
  latency?: number;
}

/**
 * AI Provider Service
 * Abstraction layer for different AI providers
 */
export class AIProviderService {
  /**
   * Get available AI providers based on configuration
   */
  static getAvailableProviders(): AIProviderConfig[] {
    const providers: AIProviderConfig[] = [];

    if (config.geminiApiKey) {
      providers.push({
        provider: 'gemini',
        apiKey: config.geminiApiKey,
        model: 'gemini-pro',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      });
    }

    if (config.groqApiKey) {
      providers.push({
        provider: 'groq',
        apiKey: config.groqApiKey,
        model: 'llama-3.1-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
      });
    }

    if (config.openrouterApiKey) {
      providers.push({
        provider: 'openrouter',
        apiKey: config.openrouterApiKey,
        model: 'openai/gpt-4',
        baseUrl: 'https://openrouter.ai/api/v1',
      });
    }

    return providers;
  }

  /**
   * Get provider by name
   */
  static getProvider(providerName: string): AIProviderConfig | null {
    const providers = this.getAvailableProviders();
    return providers.find(p => p.provider === providerName) || null;
  }

  /**
   * Call Gemini API
   */
  static async callGemini(request: AIRequest, apiKey: string): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: request.prompt }]
            }],
            generationConfig: {
              temperature: request.temperature || 0.7,
              maxOutputTokens: request.maxTokens || 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        model: 'gemini-pro',
        provider: 'gemini',
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        },
        latency,
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  /**
   * Call Groq API
   */
  static async callGroq(request: AIRequest, apiKey: string): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const messages = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt });

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.maxTokens || 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: 'llama-3.1-70b-versatile',
        provider: 'groq',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        latency,
      };
    } catch (error) {
      console.error('Groq API error:', error);
      throw error;
    }
  }

  /**
   * Call OpenRouter API
   */
  static async callOpenRouter(request: AIRequest, apiKey: string): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const messages = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://baymax.ai',
          'X-Title': 'Baymax AI Website Builder',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4',
          messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.maxTokens || 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: 'openai/gpt-4',
        provider: 'openrouter',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        latency,
      };
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }

  /**
   * Call AI provider based on configuration
   */
  static async callProvider(
    provider: AIProviderConfig,
    request: AIRequest
  ): Promise<AIResponse> {
    switch (provider.provider) {
      case 'gemini':
        return this.callGemini(request, provider.apiKey);
      case 'groq':
        return this.callGroq(request, provider.apiKey);
      case 'openrouter':
        return this.callOpenRouter(request, provider.apiKey);
      default:
        throw new Error(`Unknown provider: ${provider.provider}`);
    }
  }

  /**
   * Test AI provider connection
   */
  static async testProvider(provider: AIProviderConfig): Promise<boolean> {
    try {
      const testRequest: AIRequest = {
        prompt: 'Hello, this is a test message. Please respond with "OK".',
        maxTokens: 10,
      };

      const response = await this.callProvider(provider, testRequest);
      return response.content.length > 0;
    } catch (error) {
      console.error(`Provider ${provider.provider} test failed:`, error);
      return false;
    }
  }
}
