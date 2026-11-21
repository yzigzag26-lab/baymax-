import { query, queryOne } from '../db';
import { Job, JobStatus, JobType } from '../types';

export class JobService {
  /**
   * Get next queued job of a specific type
   */
  static async getNextJob(type?: JobType): Promise<Job | null> {
    let sql = `
      SELECT * FROM jobs 
      WHERE status = 'queued'
    `;
    const params: any[] = [];

    if (type) {
      sql += ` AND type = $1`;
      params.push(type);
    }

    sql += ` ORDER BY created_at ASC LIMIT 1`;

    return queryOne<Job>(sql, params);
  }

  /**
   * Update job status
   */
  static async updateJobStatus(
    jobId: string,
    status: JobStatus,
    output?: Record<string, unknown>,
    error?: string
  ): Promise<Job | null> {
    const updates: string[] = ['status = $1'];
    const params: any[] = [status, jobId];
    let paramIndex = 3;

    if (status === 'running') {
      updates.push('started_at = COALESCE(started_at, NOW())');
    }

    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(status)) {
      updates.push('completed_at = NOW()');
    }

    if (output) {
      updates.push(`output = $${paramIndex++}`);
      params.push(JSON.stringify(output));
    }

    if (error) {
      updates.push(`error = $${paramIndex++}`);
      params.push(error);
    }

    return queryOne<Job>(
      `UPDATE jobs SET ${updates.join(', ')} WHERE id = $2 RETURNING *`,
      params
    );
  }

  /**
   * Get job by ID
   */
  static async getJob(jobId: string): Promise<Job | null> {
    return queryOne<Job>('SELECT * FROM jobs WHERE id = $1', [jobId]);
  }

  /**
   * Get jobs by status
   */
  static async getJobsByStatus(status: JobStatus, limit = 100): Promise<Job[]> {
    return query<Job>(
      'SELECT * FROM jobs WHERE status = $1 ORDER BY created_at ASC LIMIT $2',
      [status, limit]
    );
  }

  /**
   * Get failed jobs for retry
   */
  static async getFailedJobs(limit = 50): Promise<Job[]> {
    return query<Job>(
      `SELECT * FROM jobs 
       WHERE status = 'failed' 
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Retry failed job
   */
  static async retryJob(jobId: string): Promise<Job | null> {
    return queryOne<Job>(
      `UPDATE jobs 
       SET status = 'queued', error = NULL, started_at = NULL, completed_at = NULL
       WHERE id = $1 AND status = 'failed'
       RETURNING *`,
      [jobId]
    );
  }

  /**
   * Clean up expired jobs
   */
  static async cleanupExpiredJobs(): Promise<number> {
    const result = await query(
      `UPDATE jobs 
       SET status = 'expired', completed_at = NOW()
       WHERE status IN ('queued', 'running') 
       AND created_at < NOW() - INTERVAL '7 days'`
    );
    return result.length;
  }

  /**
   * Get job statistics
   */
  static async getJobStats(userId?: string): Promise<{
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  }> {
    let sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'queued') as queued,
        COUNT(*) FILTER (WHERE status IN ('running', 'validating', 'building', 'qa')) as running,
        COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
       FROM jobs
    `;
    const params: any[] = [];

    if (userId) {
      sql += ` WHERE user_id = $1`;
      params.push(userId);
    }

    const stats = await queryOne<{
      total: string;
      queued: string;
      running: string;
      succeeded: string;
      failed: string;
      cancelled: string;
    }>(sql, params);

    return {
      total: parseInt(stats?.total || '0'),
      queued: parseInt(stats?.queued || '0'),
      running: parseInt(stats?.running || '0'),
      succeeded: parseInt(stats?.succeeded || '0'),
      failed: parseInt(stats?.failed || '0'),
      cancelled: parseInt(stats?.cancelled || '0'),
    };
  }
}
