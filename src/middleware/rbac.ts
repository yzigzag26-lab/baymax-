import { FastifyRequest, FastifyReply } from 'fastify';
import { getUserPlanEntitlements, getUserPlanTier, PlanEntitlements } from '../services/plan.service';
import { PlanTier } from '../types';
import { queryOne } from '../db';

declare module 'fastify' {
  interface FastifyRequest {
    userPlan?: PlanEntitlements;
    userPlanTier?: PlanTier;
  }
}

/**
 * Middleware to load user plan information
 * Attaches plan entitlements to request object
 */
export const planMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const entitlements = await getUserPlanEntitlements(request.user.id);
    const planTier = await getUserPlanTier(request.user.id);

    request.userPlan = entitlements;
    request.userPlanTier = planTier;
  } catch (error) {
    request.log.error(`Plan middleware error: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ error: 'Failed to load plan information' });
  }
};

/**
 * Middleware to require specific plan tier or higher
 */
export const requirePlan = (requiredPlan: PlanTier) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const userPlanTier = request.userPlanTier || await getUserPlanTier(request.user.id);
    const planOrder: PlanTier[] = ['free', 'business', 'pro'];
    const userPlanIndex = planOrder.indexOf(userPlanTier);
    const requiredPlanIndex = planOrder.indexOf(requiredPlan);

    if (userPlanIndex < requiredPlanIndex) {
      return reply.status(403).send({
        error: 'Plan Upgrade Required',
        message: `This feature requires ${requiredPlan} plan or higher`,
        current_plan: userPlanTier,
        required_plan: requiredPlan,
      });
    }
  };
};

/**
 * Middleware to check specific entitlement
 */
export const requireEntitlement = (entitlement: keyof PlanEntitlements) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const entitlements = request.userPlan || await getUserPlanEntitlements(request.user.id);
    const value = entitlements[entitlement];

    if (typeof value === 'boolean' && !value) {
      return reply.status(403).send({
        error: 'Feature Not Available',
        message: `This feature is not available in your current plan`,
        entitlement,
        current_plan: entitlements.plan_tier,
      });
    }

    // For numeric limits, check if user has reached limit
    if (typeof value === 'number' && value !== -1) {
      // This would need to be implemented based on the specific entitlement
      // For now, we'll just check if it's not unlimited
    }
  };
};

/**
 * Middleware to check website creation limit
 */
export const checkWebsiteLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const entitlements = request.userPlan || await getUserPlanEntitlements(request.user.id);
  
  if (entitlements.max_websites === -1) {
    return; // Unlimited
  }

  const websiteCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM websites WHERE user_id = $1 AND status != \'archived\'',
    [request.user.id]
  );

  const count = parseInt(websiteCount?.count || '0');
  
  if (count >= entitlements.max_websites) {
    return reply.status(403).send({
      error: 'Website Limit Reached',
      message: `You have reached the maximum number of websites (${entitlements.max_websites}) for your plan`,
      current_count: count,
      max_allowed: entitlements.max_websites,
      plan_tier: entitlements.plan_tier,
    });
  }
};

/**
 * Middleware to check project creation limit
 */
export const checkProjectLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const entitlements = request.userPlan || await getUserPlanEntitlements(request.user.id);
  
  if (entitlements.max_projects === -1) {
    return; // Unlimited
  }

  const projectCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM projects WHERE user_id = $1 AND status != \'deleted\'',
    [request.user.id]
  );

  const count = parseInt(projectCount?.count || '0');
  
  if (count >= entitlements.max_projects) {
    return reply.status(403).send({
      error: 'Project Limit Reached',
      message: `You have reached the maximum number of projects (${entitlements.max_projects}) for your plan`,
      current_count: count,
      max_allowed: entitlements.max_projects,
      plan_tier: entitlements.plan_tier,
    });
  }
};

/**
 * Middleware to check AI request limit
 */
export const checkAIRequestLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const entitlements = request.userPlan || await getUserPlanEntitlements(request.user.id);

  if (entitlements.max_ai_requests_per_day === -1) {
    return; // unlimited
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const requestCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM usage_events 
     WHERE user_id = $1 
     AND event_type = 'ai_request' 
     AND created_at >= $2`,
    [request.user.id, today.toISOString()]
  );

  const count = parseInt(requestCount?.count || '0');
  
  if (count >= entitlements.max_ai_requests_per_day) {
    return reply.status(429).send({
      error: 'AI Request Limit Reached',
      message: `You have reached the daily AI request limit (${entitlements.max_ai_requests_per_day}) for your plan`,
      current_count: count,
      max_allowed: entitlements.max_ai_requests_per_day,
      plan_tier: entitlements.plan_tier,
      reset_time: 'midnight UTC',
    });
  }
};
