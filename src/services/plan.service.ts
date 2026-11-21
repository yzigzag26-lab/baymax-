import { query, queryOne } from '../db';
import { PlanTier } from '../types';

export interface PlanEntitlements {
  plan_tier: PlanTier;
  can_create_websites: boolean;
  max_websites: number;
  can_use_premium_templates: boolean;
  can_use_existing_upgrade: boolean;
  can_use_guided_seo: boolean;
  ai_model_tier: 'economy' | 'standard' | 'premium';
  max_ai_requests_per_day: number;
  max_projects: number;
  preview_retention_hours: number;
  can_use_custom_domains: boolean;
  support_level: 'community' | 'email' | 'priority';
}

/**
 * Plan configuration
 * Based on PRD requirements
 */
export const PLAN_CONFIGS: Record<PlanTier, PlanEntitlements> = {
  free: {
    plan_tier: 'free',
    can_create_websites: true,
    max_websites: 3,
    can_use_premium_templates: false,
    can_use_existing_upgrade: false,
    can_use_guided_seo: false,
    ai_model_tier: 'economy',
    max_ai_requests_per_day: 10,
    max_projects: 5,
    preview_retention_hours: 24,
    can_use_custom_domains: false,
    support_level: 'community',
  },
  business: {
    plan_tier: 'business',
    can_create_websites: true,
    max_websites: 10,
    can_use_premium_templates: true,
    can_use_existing_upgrade: true,
    can_use_guided_seo: true,
    ai_model_tier: 'standard',
    max_ai_requests_per_day: 50,
    max_projects: 20,
    preview_retention_hours: 168, // 7 days
    can_use_custom_domains: true,
    support_level: 'email',
  },
  pro: {
    plan_tier: 'pro',
    can_create_websites: true,
    max_websites: -1, // unlimited
    can_use_premium_templates: true,
    can_use_existing_upgrade: true,
    can_use_guided_seo: true,
    ai_model_tier: 'premium',
    max_ai_requests_per_day: 200,
    max_projects: -1, // unlimited
    preview_retention_hours: -1, // permanent
    can_use_custom_domains: true,
    support_level: 'priority',
  },
};

/**
 * Get plan entitlements for a user
 */
export async function getUserPlanEntitlements(userId: string): Promise<PlanEntitlements> {
  const user = await queryOne<{ plan_tier: PlanTier }>(
    'SELECT plan_tier FROM users WHERE id = $1',
    [userId]
  );

  const planTier = user?.plan_tier || 'free';
  return PLAN_CONFIGS[planTier];
}

/**
 * Get user's plan tier
 */
export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  const user = await queryOne<{ plan_tier: PlanTier }>(
    'SELECT plan_tier FROM users WHERE id = $1',
    [userId]
  );

  return user?.plan_tier || 'free';
}

/**
 * Check if user can perform action based on plan
 */
export async function canUserPerformAction(
  userId: string,
  action: keyof PlanEntitlements
): Promise<boolean> {
  const entitlements = await getUserPlanEntitlements(userId);
  const value = entitlements[action];
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  return true; // For non-boolean values, assume allowed
}

/**
 * Check if user has reached website limit
 */
export async function hasReachedWebsiteLimit(userId: string): Promise<boolean> {
  const entitlements = await getUserPlanEntitlements(userId);
  
  if (entitlements.max_websites === -1) {
    return false; // Unlimited
  }

  const websiteCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM websites WHERE user_id = $1 AND status != \'archived\'',
    [userId]
  );

  const count = parseInt(websiteCount?.count || '0');
  return count >= entitlements.max_websites;
}

/**
 * Check if user has reached project limit
 */
export async function hasReachedProjectLimit(userId: string): Promise<boolean> {
  const entitlements = await getUserPlanEntitlements(userId);
  
  if (entitlements.max_projects === -1) {
    return false; // Unlimited
  }

  const projectCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM projects WHERE user_id = $1 AND status != \'deleted\'',
    [userId]
  );

  const count = parseInt(projectCount?.count || '0');
  return count >= entitlements.max_projects;
}

/**
 * Check if user has reached AI request limit for today
 */
export async function hasReachedAIRequestLimit(userId: string): Promise<boolean> {
  const entitlements = await getUserPlanEntitlements(userId);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const requestCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM usage_events 
     WHERE user_id = $1 
     AND event_type = 'ai_request' 
     AND created_at >= $2`,
    [userId, today.toISOString()]
  );

  const count = parseInt(requestCount?.count || '0');
  return count >= entitlements.max_ai_requests_per_day;
}

/**
 * Check if user can access template based on plan
 */
export async function canAccessTemplate(
  userId: string,
  templatePlanTier: PlanTier
): Promise<boolean> {
  const userPlanTier = await getUserPlanTier(userId);
  const entitlements = PLAN_CONFIGS[userPlanTier];

  // Free users can only access free templates
  if (userPlanTier === 'free') {
    return templatePlanTier === 'free';
  }

  // Business users can access free and business templates
  if (userPlanTier === 'business') {
    return templatePlanTier === 'free' || templatePlanTier === 'business';
  }

  // Pro users can access all templates
  return true;
}

/**
 * Update user plan tier
 */
export async function updateUserPlanTier(userId: string, newPlanTier: PlanTier): Promise<void> {
  await query(
    'UPDATE users SET plan_tier = $1 WHERE id = $2',
    [newPlanTier, userId]
  );
}

/**
 * Get plan upgrade options
 */
export function getPlanUpgradeOptions(currentPlan: PlanTier): PlanTier[] {
  const planOrder: PlanTier[] = ['free', 'business', 'pro'];
  const currentIndex = planOrder.indexOf(currentPlan);
  
  return planOrder.slice(currentIndex + 1);
}
