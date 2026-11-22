import { query, queryOne } from '../db';

/**
 * Preview Cleanup Service
 * Handles deletion of expired previews based on retention policy
 */
export class PreviewCleanupService {
  /**
   * Clean up expired previews
   * - Free users: Delete after 24 hours
   * - Business users: Delete after 7 days
   * - Pro users: Keep permanently (no cleanup)
   */
  static async cleanupExpiredPreviews(): Promise<{ deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;

    try {
      // Soft delete expired previews
      const result = await query(
        `UPDATE previews 
         SET deleted_at = NOW(), status = 'expired'
         WHERE deleted_at IS NULL 
         AND expires_at IS NOT NULL 
         AND expires_at < NOW()
         AND retention_policy != 'permanent'
         RETURNING id`
      );

      deleted = result.length;
      console.log(`Cleaned up ${deleted} expired previews`);
    } catch (error) {
      console.error('Error cleaning up previews:', error);
      errors++;
    }

    // Hard delete old soft-deleted previews (after 30 days)
    try {
      const hardDeleteResult = await query(
        `DELETE FROM previews 
         WHERE deleted_at IS NOT NULL 
         AND deleted_at < NOW() - INTERVAL '30 days'`
      );

      console.log(`Hard deleted ${hardDeleteResult.length} old previews`);
    } catch (error) {
      console.error('Error hard deleting previews:', error);
      errors++;
    }

    return { deleted, errors };
  }

  /**
   * Get preview statistics
   */
  static async getPreviewStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    deleted: number;
    byPlan: Record<string, number>;
  }> {
    const stats = await queryOne<{
      total: string;
      active: string;
      expired: string;
      deleted: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE status = 'expired' AND deleted_at IS NULL) as expired,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
       FROM previews`
    );

    const byPlan = await query<{ plan_tier: string; count: string }>(
      `SELECT plan_tier, COUNT(*) as count 
       FROM previews 
       WHERE deleted_at IS NULL 
       GROUP BY plan_tier`
    );

    const planStats: Record<string, number> = {};
    byPlan.forEach((row: any) => {
      planStats[row.plan_tier] = parseInt(row.count);
    });

    return {
      total: parseInt(stats?.total || '0'),
      active: parseInt(stats?.active || '0'),
      expired: parseInt(stats?.expired || '0'),
      deleted: parseInt(stats?.deleted || '0'),
      byPlan: planStats,
    };
  }
}
