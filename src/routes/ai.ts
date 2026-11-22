import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { planMiddleware, checkAIRequestLimit } from '../middleware/rbac';
import { AIGatewayService } from '../services/ai-gateway.service';
import { AIProviderService } from '../services/ai-provider.service';
import { UsageService } from '../services/usage.service';
import { query, queryOne } from '../db';
import { PlanTier } from '../types';

const generateRequestSchema = z.object({
  website_id: z.string().uuid(),
  blueprint_id: z.string().uuid().optional(),
});

const editRequestSchema = z.object({
  website_id: z.string().uuid(),
  edit_request: z.string().min(1),
  version_id: z.string().uuid().optional(),
});

const seoRequestSchema = z.object({
  website_id: z.string().uuid(),
  keywords: z.array(z.string()).min(1),
});

export async function aiRoutes(fastify: FastifyInstance) {
  // Generate website from blueprint
  fastify.post('/ai/generate', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Generate website',
      description: 'Generate website code from blueprint using AI',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          blueprint_id: { type: 'string', format: 'uuid' },
        },
        required: ['website_id'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, blueprint_id } = generateRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get blueprint
    let blueprint;
    if (blueprint_id) {
      blueprint = await queryOne(
        'SELECT * FROM blueprints WHERE id = $1 AND website_id = $2',
        [blueprint_id, website_id]
      );
    } else {
      blueprint = await queryOne(
        'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC LIMIT 1',
        [website_id]
      );
    }

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    // Get business profile
    const businessProfile = await queryOne(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [website_id]
    );

    try {
      const response = await AIGatewayService.generateWebsite(
        user.id,
        planTier as PlanTier,
        blueprint,
        businessProfile
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'website_generated',
        {
          website_id,
          blueprint_id: blueprint.id,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        generated_code: response.content,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI generation error:', error);
      return reply.status(500).send({
        error: 'AI Generation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Edit website
  fastify.post('/ai/edit', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Edit website',
      description: 'Edit website code using AI based on user request',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          edit_request: { type: 'string', minLength: 1 },
          version_id: { type: 'string', format: 'uuid' },
        },
        required: ['website_id', 'edit_request'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, edit_request, version_id } = editRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get current version code (simplified - in real app would get from storage)
    const currentCode = '/* Current website code would be fetched here */';

    // Get blueprint
    const blueprint = await queryOne(
      'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC LIMIT 1',
      [website_id]
    );

    try {
      const response = await AIGatewayService.editWebsite(
        user.id,
        planTier as PlanTier,
        currentCode,
        edit_request,
        blueprint
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'website_edited',
        {
          website_id,
          edit_request,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        edited_code: response.content,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI edit error:', error);
      return reply.status(500).send({
        error: 'AI Edit Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Optimize SEO
  fastify.post('/ai/seo', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Optimize SEO',
      description: 'Optimize website SEO using AI',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          keywords: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        required: ['website_id', 'keywords'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, keywords } = seoRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Check if user has SEO entitlement
    if (planTier === 'free') {
      return reply.status(403).send({
        error: 'SEO Feature Not Available',
        message: 'SEO optimization requires Business or Pro plan',
      });
    }

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get website content (simplified)
    const websiteContent = '/* Website content would be fetched here */';

    try {
      const response = await AIGatewayService.optimizeSEO(
        user.id,
        planTier as PlanTier,
        websiteContent,
        keywords
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'seo_optimization',
        {
          website_id,
          keywords,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        seo_recommendations: response.content,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI SEO error:', error);
      return reply.status(500).send({
        error: 'AI SEO Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get AI usage statistics
  fastify.get('/ai/usage', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['AI'],
      summary: 'Get AI usage statistics',
      description: 'Get AI usage statistics for the authenticated user',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { days = 30 } = request.query as { days?: number };

    const stats = await AIGatewayService.getUsageStats(user.id, days);

    return {
      stats,
      limits: {
        daily_requests: request.userPlan?.max_ai_requests_per_day || 0,
        plan_tier: request.userPlan?.plan_tier || 'free',
      },
    };
  });

  // Get available AI providers
  fastify.get('/ai/providers', {
    preHandler: authMiddleware,
    schema: {
      tags: ['AI'],
      summary: 'Get available AI providers',
      description: 'Get list of configured AI providers',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const providers = AIProviderService.getAvailableProviders();

    return {
      providers: providers.map(p => ({
        provider: p.provider,
        model: p.model,
        available: true,
      })),
    };
  });

  // Check AI provider health
  fastify.get('/ai/health', {
    preHandler: authMiddleware,
    schema: {
      tags: ['AI'],
      summary: 'Check AI provider health',
      description: 'Check health status of AI providers',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const health = await AIGatewayService.checkProviderHealth();

    return {
      health,
      timestamp: new Date().toISOString(),
    };
  });
}
