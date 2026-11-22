import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../db';
import { Blueprint } from '../types';

export async function blueprintRoutes(fastify: FastifyInstance) {
  // Create blueprint for website
  fastify.post('/websites/:websiteId/blueprint', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Create blueprint',
      description: 'Create a new blueprint for a website',
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

    // Get next version number
    const versionResult = await queryOne<{ max_version: number }>(
      'SELECT COALESCE(MAX(version), 0) + 1 as max_version FROM blueprints WHERE website_id = $1',
      [websiteId]
    );
    const version = versionResult?.max_version || 1;

    const body = request.body as Record<string, any> | undefined;

    // Create blueprint
    const blueprint = await queryOne<Blueprint>(
      `INSERT INTO blueprints (website_id, version, status, sitemap, pages, design_tokens, components, content_plan, seo_fields, integrations, constraints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        websiteId,
        version,
        'draft',
        JSON.stringify(body?.sitemap || {}),
        JSON.stringify(body?.pages || []),
        JSON.stringify(body?.design_tokens || {}),
        JSON.stringify(body?.components || []),
        JSON.stringify(body?.content_plan || {}),
        JSON.stringify(body?.seo_fields || null),
        JSON.stringify(body?.integrations || null),
        JSON.stringify(body?.constraints || null),
      ]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'blueprint.created', 'blueprint', blueprint?.id, JSON.stringify({ website_id: websiteId, version })]
    );

    return reply.status(201).send({ blueprint });
  });

  // Get blueprint by ID
  fastify.get('/blueprints/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Get blueprint by ID',
      description: 'Retrieve a specific blueprint by ID',
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

    const blueprint = await queryOne<Blueprint>(
      `SELECT b.* FROM blueprints b
       JOIN websites w ON b.website_id = w.id
       WHERE b.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    return { blueprint };
  });

  // Get blueprints for website
  fastify.get('/websites/:websiteId/blueprints', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Get website blueprints',
      description: 'Get all blueprints for a website',
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

    const blueprints = await query<Blueprint>(
      'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC',
      [websiteId]
    );

    return { blueprints };
  });

  // Update blueprint
  fastify.patch('/blueprints/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Update blueprint',
      description: 'Update an existing blueprint',
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
    const blueprint = await queryOne<Blueprint>(
      `SELECT b.* FROM blueprints b
       JOIN websites w ON b.website_id = w.id
       WHERE b.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    // Only allow updates to draft blueprints
    if (blueprint.status !== 'draft') {
      return reply.status(400).send({ error: 'Can only update draft blueprints' });
    }

    // Update blueprint fields
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const body = request.body as any;
    if (body.sitemap) {
      updates.push(`sitemap = $${paramIndex++}`);
      values.push(JSON.stringify(body.sitemap));
    }
    if (body.pages) {
      updates.push(`pages = $${paramIndex++}`);
      values.push(JSON.stringify(body.pages));
    }
    if (body.design_tokens) {
      updates.push(`design_tokens = $${paramIndex++}`);
      values.push(JSON.stringify(body.design_tokens));
    }
    if (body.components) {
      updates.push(`components = $${paramIndex++}`);
      values.push(JSON.stringify(body.components));
    }
    if (body.content_plan) {
      updates.push(`content_plan = $${paramIndex++}`);
      values.push(JSON.stringify(body.content_plan));
    }
    if (body.seo_fields) {
      updates.push(`seo_fields = $${paramIndex++}`);
      values.push(JSON.stringify(body.seo_fields));
    }
    if (body.integrations) {
      updates.push(`integrations = $${paramIndex++}`);
      values.push(JSON.stringify(body.integrations));
    }
    if (body.constraints) {
      updates.push(`constraints = $${paramIndex++}`);
      values.push(JSON.stringify(body.constraints));
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const updatedBlueprint = await queryOne<Blueprint>(
      `UPDATE blueprints 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'blueprint.updated', 'blueprint', id, JSON.stringify({ fields: Object.keys(body) })]
    );

    return { blueprint: updatedBlueprint };
  });

  // Approve blueprint
  fastify.post('/blueprints/:id/approve', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Approve blueprint',
      description: 'Approve a blueprint for website generation',
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
    const blueprint = await queryOne<Blueprint>(
      `SELECT b.* FROM blueprints b
       JOIN websites w ON b.website_id = w.id
       WHERE b.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    if (blueprint.status !== 'draft') {
      return reply.status(400).send({ error: 'Blueprint is not in draft status' });
    }

    const updatedBlueprint = await queryOne<Blueprint>(
      `UPDATE blueprints 
       SET status = 'approved'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'blueprint.approved', 'blueprint', id, JSON.stringify({ website_id: blueprint.website_id })]
    );

    return { blueprint: updatedBlueprint };
  });

  // Reject blueprint
  fastify.post('/blueprints/:id/reject', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Blueprints'],
      summary: 'Reject blueprint',
      description: 'Reject a blueprint',
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
          reason: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify ownership through website
    const blueprint = await queryOne<Blueprint>(
      `SELECT b.* FROM blueprints b
       JOIN websites w ON b.website_id = w.id
       WHERE b.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    if (blueprint.status !== 'draft') {
      return reply.status(400).send({ error: 'Blueprint is not in draft status' });
    }

    const updatedBlueprint = await queryOne<Blueprint>(
      `UPDATE blueprints 
       SET status = 'rejected'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'blueprint.rejected', 'blueprint', id, JSON.stringify({ website_id: blueprint.website_id, reason })]
    );

    return { blueprint: updatedBlueprint };
  });
}
