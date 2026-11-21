import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../db';
import { Preview } from '../types';

const createPreviewSchema = z.object({
  version_id: z.string().uuid(),
  build_id: z.string().uuid().optional(),
  environment: z.string().default('preview'),
  url: z.string().url(),
  expires_at: z.string().datetime().optional(),
});

export async function previewRoutes(fastify: FastifyInstance) {
  // Create preview
  fastify.post('/websites/:websiteId/previews', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Create preview',
      description: 'Create a new preview for a website version',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          websiteId: { type: 'string', format: 'uuid' },
        },
        required: ['websiteId'],
      },
      body: {
        type: 'object',
        properties: {
          version_id: { type: 'string', format: 'uuid' },
          build_id: { type: 'string', format: 'uuid' },
          environment: { type: 'string', default: 'preview' },
          url: { type: 'string', format: 'uri' },
          expires_at: { type: 'string', format: 'date-time' },
        },
        required: ['version_id', 'url'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { websiteId } = request.params as { websiteId: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify website ownership
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    const body = createPreviewSchema.parse(request.body);

    // Verify version belongs to website
    const version = await queryOne(
      'SELECT * FROM website_versions WHERE id = $1 AND website_id = $2',
      [body.version_id, websiteId]
    );

    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    // Get user plan tier
    const userPlan = await queryOne<{ plan_tier: string }>(
      'SELECT plan_tier FROM users WHERE id = $1',
      [user.id]
    );
    const planTier = (userPlan?.plan_tier || 'free') as 'free' | 'business' | 'pro';

    // Set retention policy based on plan
    let retentionPolicy: 'standard' | 'extended' | 'permanent' = 'standard';
    let expiresAt: Date | null = null;

    if (planTier === 'free') {
      retentionPolicy = 'standard';
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    } else if (planTier === 'business') {
      retentionPolicy = 'extended';
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    } else if (planTier === 'pro') {
      retentionPolicy = 'permanent';
      expiresAt = null; // No expiry
    }

    // Use provided expires_at if specified, otherwise use plan-based expiry
    const finalExpiresAt = body.expires_at ? new Date(body.expires_at) : expiresAt;

    const preview = await queryOne<Preview>(
      `INSERT INTO previews (website_id, version_id, build_id, environment, url, expires_at, retention_policy, plan_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [websiteId, body.version_id, body.build_id || null, body.environment, body.url, finalExpiresAt?.toISOString() || null, retentionPolicy, planTier]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'preview.created', 'preview', preview?.id, JSON.stringify({ website_id: websiteId, version_id: body.version_id })]
    );

    return reply.status(201).send({ preview });
  });

  // Get all previews for website
  fastify.get('/websites/:websiteId/previews', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Get website previews',
      description: 'Get all previews for a website',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          websiteId: { type: 'string', format: 'uuid' },
        },
        required: ['websiteId'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { websiteId } = request.params as { websiteId: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify website ownership
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    const previews = await query<Preview>(
      `SELECT p.*, v.version_number, v.origin
       FROM previews p
       JOIN website_versions v ON p.version_id = v.id
       WHERE p.website_id = $1
       ORDER BY p.created_at DESC`,
      [websiteId]
    );

    return { previews };
  });

  // Get single preview
  fastify.get('/previews/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Get preview by ID',
      description: 'Retrieve a specific preview by ID',
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

    const preview = await queryOne<Preview>(
      `SELECT p.*, v.version_number, v.origin
       FROM previews p
       JOIN website_versions v ON p.version_id = v.id
       JOIN websites w ON p.website_id = w.id
       WHERE p.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!preview) {
      return reply.status(404).send({ error: 'Preview not found' });
    }

    return { preview };
  });

  // Update preview status
  fastify.patch('/previews/:id/status', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Update preview status',
      description: 'Update preview status (active, expired, failed)',
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
          status: { type: 'string', enum: ['active', 'expired', 'failed'] },
        },
        required: ['status'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify ownership through website
    const preview = await queryOne<Preview>(
      `SELECT p.* FROM previews p
       JOIN websites w ON p.website_id = w.id
       WHERE p.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!preview) {
      return reply.status(404).send({ error: 'Preview not found' });
    }

    const updatedPreview = await queryOne<Preview>(
      `UPDATE previews 
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'preview.status_updated', 'preview', id, JSON.stringify({ status })]
    );

    return { preview: updatedPreview };
  });

  // Delete preview
  fastify.delete('/previews/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Delete preview',
      description: 'Delete a preview',
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

    // Verify ownership through website
    const preview = await queryOne<Preview>(
      `SELECT p.* FROM previews p
       JOIN websites w ON p.website_id = w.id
       WHERE p.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!preview) {
      return reply.status(404).send({ error: 'Preview not found' });
    }

    await query('DELETE FROM previews WHERE id = $1', [id]);

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'preview.deleted', 'preview', id, JSON.stringify({})]
    );

    return { message: 'Preview deleted successfully' };
  });

  // Get latest preview for website
  fastify.get('/websites/:websiteId/previews/latest', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Previews'],
      summary: 'Get latest preview',
      description: 'Get the most recent active preview for a website',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          websiteId: { type: 'string', format: 'uuid' },
        },
        required: ['websiteId'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { websiteId } = request.params as { websiteId: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify website ownership
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    const preview = await queryOne<Preview>(
      `SELECT p.*, v.version_number, v.origin
       FROM previews p
       JOIN website_versions v ON p.version_id = v.id
       WHERE p.website_id = $1 AND p.status = 'active'
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [websiteId]
    );

    if (!preview) {
      return reply.status(404).send({ error: 'No active preview found' });
    }

    return { preview };
  });
}
