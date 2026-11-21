import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { planMiddleware, checkAIRequestLimit } from '../middleware/rbac';
import { query, queryOne } from '../db';
import { Job, JobStatus, JobType } from '../types';

const jobQuerySchema = z.object({
  status: z.enum(['queued', 'running', 'validating', 'building', 'qa', 'succeeded', 'failed', 'cancelled', 'expired']).optional(),
  type: z.enum(['generation', 'edit', 'build', 'deploy', 'seo', 'upgrade']).optional(),
  website_id: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function jobRoutes(fastify: FastifyInstance) {
  // Get all jobs for user
  fastify.get('/jobs', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Jobs'],
      summary: 'Get all jobs',
      description: 'Get all jobs for the authenticated user with optional filters',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['queued', 'running', 'validating', 'building', 'qa', 'succeeded', 'failed', 'cancelled', 'expired'] },
          type: { type: 'string', enum: ['generation', 'edit', 'build', 'deploy', 'seo', 'upgrade'] },
          website_id: { type: 'string', format: 'uuid' },
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const queryParams = jobQuerySchema.parse(request.query);
    const { status, type, website_id, page, limit } = queryParams;
    const offset = (page - 1) * limit;

    // Build query dynamically
    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [user.id];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (type) {
      whereClause += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    if (website_id) {
      whereClause += ` AND website_id = $${paramIndex++}`;
      params.push(website_id);
    }

    // Get total count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0');

    // Get jobs
    const jobs = await query<Job>(
      `SELECT * FROM jobs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Get single job
  fastify.get('/jobs/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Jobs'],
      summary: 'Get job by ID',
      description: 'Retrieve a specific job by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { id } = request.params as { id: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const job = await queryOne<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return { job };
  });

  // Create job
  fastify.post('/jobs', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['Jobs'],
      summary: 'Create job',
      description: 'Create a new job',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['generation', 'edit', 'build', 'deploy', 'seo', 'upgrade'] },
          website_id: { type: 'string', format: 'uuid' },
          project_id: { type: 'string', format: 'uuid' },
          input: { type: 'object' },
        },
        required: ['type', 'input'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { type, website_id, project_id, input } = request.body as {
      type: JobType;
      website_id?: string;
      project_id?: string;
      input: Record<string, unknown>;
    };

    // Verify website ownership if provided
    if (website_id) {
      const website = await queryOne(
        'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
        [website_id, user.id]
      );

      if (!website) {
        return reply.status(404).send({ error: 'Website not found' });
      }
    }

    // Verify project ownership if provided
    if (project_id) {
      const project = await queryOne(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [project_id, user.id]
      );

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }
    }

    // Check AI request limit for AI-related jobs
    if (['generation', 'edit', 'seo', 'upgrade'].includes(type)) {
      const entitlements = request.userPlan;
      if (entitlements) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const requestCount = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM usage_events 
           WHERE user_id = $1 
           AND event_type = 'ai_request' 
           AND created_at >= $2`,
          [user.id, today.toISOString()]
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
      }
    }

    const job = await queryOne<Job>(
      `INSERT INTO jobs (type, status, website_id, project_id, user_id, input)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [type, 'queued', website_id || null, project_id || null, user.id, JSON.stringify(input)]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'job.created', 'job', job?.id, JSON.stringify({ type, website_id, project_id })]
    );

    // TODO: Trigger job processor (to be implemented)
    // For now, job is just queued

    return reply.status(201).send({ job });
  });

  // Cancel job
  fastify.post('/jobs/:id/cancel', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Jobs'],
      summary: 'Cancel job',
      description: 'Cancel a running or queued job',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { id } = request.params as { id: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const job = await queryOne<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    // Can only cancel queued or running jobs
    if (!['queued', 'running', 'validating', 'building', 'qa'].includes(job.status)) {
      return reply.status(400).send({ error: 'Job cannot be cancelled in current status' });
    }

    const updatedJob = await queryOne<Job>(
      `UPDATE jobs 
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'job.cancelled', 'job', id, JSON.stringify({ previous_status: job.status })]
    );

    // TODO: Notify job processor to stop processing (to be implemented)

    return { job: updatedJob };
  });

  // Update job status (internal use - for job processors)
  fastify.patch('/jobs/:id/status', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Jobs'],
      summary: 'Update job status',
      description: 'Update job status (internal use)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['queued', 'running', 'validating', 'building', 'qa', 'succeeded', 'failed', 'cancelled', 'expired'] },
          output: { type: 'object' },
          error: { type: 'string' },
        },
        required: ['status'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { id } = request.params as { id: string };
    const { status, output, error } = request.body as {
      status: JobStatus;
      output?: Record<string, unknown>;
      error?: string;
    };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const job = await queryOne<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    const updates: string[] = ['status = $1'];
    const values: any[] = [status, id];
    let paramIndex = 3;

    if (status === 'running' && !job.started_at) {
      updates.push('started_at = NOW()');
    }

    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(status)) {
      updates.push('completed_at = NOW()');
    }

    if (output) {
      updates.push(`output = $${paramIndex++}`);
      values.push(JSON.stringify(output));
    }

    if (error) {
      updates.push(`error = $${paramIndex++}`);
      values.push(error);
    }

    const updatedJob = await queryOne<Job>(
      `UPDATE jobs 
       SET ${updates.join(', ')}
       WHERE id = $2
       RETURNING *`,
      values
    );

    return { job: updatedJob };
  });

  // Get job statistics
  fastify.get('/jobs/stats', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Jobs'],
      summary: 'Get job statistics',
      description: 'Get job statistics for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const stats = await queryOne<{
      total: string;
      queued: string;
      running: string;
      succeeded: string;
      failed: string;
      cancelled: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'queued') as queued,
        COUNT(*) FILTER (WHERE status IN ('running', 'validating', 'building', 'qa')) as running,
        COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
       FROM jobs 
       WHERE user_id = $1`,
      [user.id]
    );

    return {
      stats: {
        total: parseInt(stats?.total || '0'),
        queued: parseInt(stats?.queued || '0'),
        running: parseInt(stats?.running || '0'),
        succeeded: parseInt(stats?.succeeded || '0'),
        failed: parseInt(stats?.failed || '0'),
        cancelled: parseInt(stats?.cancelled || '0'),
      },
    };
  });
}
