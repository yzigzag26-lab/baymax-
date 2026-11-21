import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../db';
import { Template, PlanTier } from '../types';

const templateQuerySchema = z.object({
  category: z.string().optional(),
  plan_tier: z.enum(['free', 'business', 'pro']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function templateRoutes(fastify: FastifyInstance) {
  // Get all templates with filters
  fastify.get('/templates', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Templates'],
      summary: 'Get templates',
      description: 'Get templates with optional filters and pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          plan_tier: { type: 'string', enum: ['free', 'business', 'pro'] },
          search: { type: 'string' },
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

    const queryParams = templateQuerySchema.parse(request.query);
    const { category, plan_tier, search, page, limit } = queryParams;
    const offset = (page - 1) * limit;

    // Build query dynamically
    let whereClause = 'WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (plan_tier) {
      whereClause += ` AND plan_tier = $${paramIndex++}`;
      params.push(plan_tier);
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM templates ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0');

    // Get templates
    const templates = await query<Template>(
      `SELECT * FROM templates ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      templates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Get single template
  fastify.get('/templates/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Templates'],
      summary: 'Get template by ID',
      description: 'Retrieve a specific template by ID',
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

    const template = await queryOne<Template>(
      'SELECT * FROM templates WHERE id = $1 AND is_active = true',
      [id]
    );

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return { template };
  });

  // Get template categories
  fastify.get('/templates/categories', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Templates'],
      summary: 'Get template categories',
      description: 'Get all available template categories',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const categories = await query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) as count 
       FROM templates 
       WHERE is_active = true 
       GROUP BY category 
       ORDER BY category`
    );

    return { categories };
  });

  // Apply template to project
  fastify.post('/projects/:projectId/template', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Templates'],
      summary: 'Apply template to project',
      description: 'Apply a template to a project',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string', format: 'uuid' },
        },
        required: ['projectId'],
      },
      body: {
        type: 'object',
        properties: {
          template_id: { type: 'string', format: 'uuid' },
        },
        required: ['template_id'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { projectId } = request.params as { projectId: string };
    const { template_id } = request.body as { template_id: string };

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify project ownership
    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, user.id]
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Verify template exists and is active
    const template = await queryOne<Template>(
      'SELECT * FROM templates WHERE id = $1 AND is_active = true',
      [template_id]
    );

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    // Check plan tier access
    const userPlanTier = (user as any).plan_tier || 'free';
    if (template.plan_tier === 'pro' && userPlanTier !== 'pro') {
      return reply.status(403).send({ error: 'Pro plan required for this template' });
    }
    if (template.plan_tier === 'business' && userPlanTier === 'free') {
      return reply.status(403).send({ error: 'Business plan required for this template' });
    }

    // Update project with template (this would typically create a website record too)
    // For now, we'll just log the association
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'template.applied', 'project', projectId, JSON.stringify({ template_id, template_name: template.name })]
    );

    return {
      message: 'Template applied successfully',
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
      },
    };
  });
}
