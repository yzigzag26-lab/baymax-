import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { planMiddleware } from '../middleware/rbac';
import { UsageService, UsageEventType } from '../services/usage.service';
import { getUserPlanEntitlements } from '../services/plan.service';

export async function usageRoutes(fastify: FastifyInstance) {
  // Get user usage statistics
  fastify.get('/usage/stats', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['Usage'],
      summary: 'Get usage statistics',
      description: 'Get usage statistics for the authenticated user',
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

    const stats = await UsageService.getUserUsageStats(user.id, days);
    const entitlements = request.userPlan;
    const todayAIRequests = await UsageService.getTodayAIRequests(user.id);

    return {
      stats,
      limits: {
        ai_requests_today: {
          used: todayAIRequests,
          limit: entitlements?.max_ai_requests_per_day || 0,
          remaining: Math.max(0, (entitlements?.max_ai_requests_per_day || 0) - todayAIRequests),
        },
        websites: {
          limit: entitlements?.max_websites || 0,
          unlimited: entitlements?.max_websites === -1,
        },
        projects: {
          limit: entitlements?.max_projects || 0,
          unlimited: entitlements?.max_projects === -1,
        },
      },
      plan: {
        tier: entitlements?.plan_tier || 'free',
        ai_model_tier: entitlements?.ai_model_tier || 'economy',
        preview_retention_hours: entitlements?.preview_retention_hours || 24,
      },
    };
  });

  // Get user usage events
  fastify.get('/usage/events', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['Usage'],
      summary: 'Get usage events',
      description: 'Get usage events for the authenticated user',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          event_type: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { event_type, limit = 100, offset = 0 } = request.query as {
      event_type?: UsageEventType;
      limit?: number;
      offset?: number;
    };

    const events = await UsageService.getUserEvents(user.id, event_type, limit, offset);

    return { events };
  });

  // Get plan information
  fastify.get('/usage/plan', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['Usage'],
      summary: 'Get plan information',
      description: 'Get current plan information and entitlements',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const entitlements = request.userPlan;

    return {
      plan: entitlements,
    };
  });
}
