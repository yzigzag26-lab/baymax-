import { query, queryOne } from '../db';

export interface UsageEvent {
  id: string;
  user_id: string;
  project_id?: string;
  website_id?: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export type UsageEventType = 
  | 'ai_request'
  | 'website_created'
  | 'website_generated'
  | 'website_edited'
  | 'preview_created'
  | 'deployment_created'
  | 'template_applied'
  | 'blueprint_created'
  | 'blueprint_generated'
  | 'seo_optimization'
  | 'upgrade_analysis'
  | 'api_call';

/**
 * Usage Tracking Service
 * Tracks user activity and resource usage
 */
export class UsageService {
  /**
   * Track a usage event
   */
  static async trackEvent(
    userId: string,
    eventType: UsageEventType,
    metadata?: Record<string, unknown>,
    projectId?: string,
    websiteId?: string
  ): Promise<void> {
    await query(
      `INSERT INTO usage_events (user_id, project_id, website_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, projectId || null, websiteId || null, eventType, metadata ? JSON.stringify(metadata) : null]
    );
  }

  /**
   * Get usage statistics for a user
   */
  static async getUserUsageStats(userId: string, days = 30): Promise<{
    total_events: number;
    ai_requests: number;
    websites_created: number;
    websites_generated: number;
    previews_created: number;
    deployments_created: number;
    by_event_type: Record<string, number>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await queryOne<{
      total_events: string;
      ai_requests: string;
      websites_created: string;
      websites_generated: string;
      previews_created: string;
      deployments_created: string;
    }>(
      `SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_type = 'ai_request') as ai_requests,
        COUNT(*) FILTER (WHERE event_type = 'website_created') as websites_created,
        COUNT(*) FILTER (WHERE event_type = 'website_generated') as websites_generated,
        COUNT(*) FILTER (WHERE event_type = 'preview_created') as previews_created,
        COUNT(*) FILTER (WHERE event_type = 'deployment_created') as deployments_created
       FROM usage_events 
       WHERE user_id = $1 AND created_at >= $2`,
      [userId, startDate.toISOString()]
    );

    const byEventType = await query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*) as count 
       FROM usage_events 
       WHERE user_id = $1 AND created_at >= $2
       GROUP BY event_type`,
      [userId, startDate.toISOString()]
    );

    const eventTypeStats: Record<string, number> = {};
    byEventType.forEach((row: any) => {
      eventTypeStats[row.event_type] = parseInt(row.count);
    });

    return {
      total_events: parseInt(stats?.total_events || '0'),
      ai_requests: parseInt(stats?.ai_requests || '0'),
      websites_created: parseInt(stats?.websites_created || '0'),
      websites_generated: parseInt(stats?.websites_generated || '0'),
      previews_created: parseInt(stats?.previews_created || '0'),
      deployments_created: parseInt(stats?.deployments_created || '0'),
      by_event_type: eventTypeStats,
    };
  }

  /**
   * Get AI requests for today
   */
  static async getTodayAIRequests(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM usage_events 
       WHERE user_id = $1 
       AND event_type = 'ai_request' 
       AND created_at >= $2`,
      [userId, today.toISOString()]
    );

    return parseInt(result?.count || '0');
  }

  /**
   * Get usage events for a user
   */
  static async getUserEvents(
    userId: string,
    eventType?: UsageEventType,
    limit = 100,
    offset = 0
  ): Promise<UsageEvent[]> {
    let sql = 'SELECT * FROM usage_events WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (eventType) {
      sql += ` AND event_type = $${paramIndex++}`;
      params.push(eventType);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    return query<UsageEvent>(sql, params);
  }

  /**
   * Clean up old usage events (older than 90 days)
   */
  static async cleanupOldEvents(): Promise<number> {
    const result = await query(
      `DELETE FROM usage_events 
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    return result.length;
  }
}
