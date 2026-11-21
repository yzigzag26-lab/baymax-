import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../db';
import { Website, BusinessProfile, WebsiteStatus } from '../types';

const createWebsiteSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  template_id: z.string().uuid().optional(),
});

const updateWebsiteSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(['draft', 'generating', 'preview', 'published', 'archived']).optional(),
});

const businessProfileSchema = z.object({
  business_name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  target_audience: z.string().max(500).optional(),
  brand_colors: z.array(z.string()).optional(),
  logo_url: z.string().url().optional(),
  contact_info: z.record(z.any()).optional(),
  goals: z.array(z.string()).optional(),
});

export async function websiteRoutes(fastify: FastifyInstance) {
  // Create website
  fastify.post('/websites', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Create website',
      description: 'Create a new website in a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          project_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          template_id: { type: 'string', format: 'uuid' },
        },
        required: ['project_id', 'name'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const body = createWebsiteSchema.parse(request.body);

    // Verify project ownership
    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [body.project_id, user.id]
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // If template_id provided, verify it exists
    if (body.template_id) {
      const template = await queryOne(
        'SELECT * FROM templates WHERE id = $1 AND is_active = true',
        [body.template_id]
      );

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' });
      }
    }

    const website = await queryOne<Website>(
      `INSERT INTO websites (project_id, user_id, name, template_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [body.project_id, user.id, body.name, body.template_id || null]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'website.created', 'website', website?.id, JSON.stringify({ project_id: body.project_id, name: body.name })]
    );

    // Log usage event
    await query(
      `INSERT INTO usage_events (user_id, project_id, website_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, body.project_id, website?.id, 'website.created', JSON.stringify({ name: body.name })]
    );

    return reply.status(201).send({ website });
  });

  // Get all websites for user
  fastify.get('/websites', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Get all websites',
      description: 'Get all websites for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const websites = await query<Website>(
      `SELECT w.*, p.name as project_name
       FROM websites w
       JOIN projects p ON w.project_id = p.id
       WHERE w.user_id = $1 AND w.status != 'archived'
       ORDER BY w.created_at DESC`,
      [user.id]
    );

    return { websites };
  });

  // Get websites by project
  fastify.get('/projects/:projectId/websites', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Get project websites',
      description: 'Get all websites in a project',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string', format: 'uuid' },
        },
        required: ['projectId'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { projectId } = request.params as { projectId: string };

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

    const websites = await query<Website>(
      'SELECT * FROM websites WHERE project_id = $1 AND status != \'archived\' ORDER BY created_at DESC',
      [projectId]
    );

    return { websites };
  });

  // Get single website
  fastify.get('/websites/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Get website by ID',
      description: 'Retrieve a specific website by ID',
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

    const website = await queryOne<Website>(
      `SELECT w.*, p.name as project_name
       FROM websites w
       JOIN projects p ON w.project_id = p.id
       WHERE w.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get business profile if exists
    const businessProfile = await queryOne<BusinessProfile>(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [id]
    );

    // Get current blueprint if exists
    const blueprint = await queryOne(
      'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC LIMIT 1',
      [id]
    );

    return {
      website,
      business_profile: businessProfile,
      current_blueprint: blueprint,
    };
  });

  // Update website
  fastify.patch('/websites/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Update website',
      description: 'Update an existing website',
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

    const body = updateWebsiteSchema.parse(request.body);

    // Build update query
    const updates: string[] = [];
    const values: any[] = [id, user.id];
    let paramIndex = 3;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
    }
    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const website = await queryOne<Website>(
      `UPDATE websites 
       SET ${updates.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'website.updated', 'website', id, JSON.stringify(body)]
    );

    return { website };
  });

  // Delete website (archive)
  fastify.delete('/websites/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Delete website',
      description: 'Archive a website',
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

    const website = await queryOne<Website>(
      `UPDATE websites 
       SET status = 'archived'
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'website.archived', 'website', id, JSON.stringify({})]
    );

    return { message: 'Website archived successfully' };
  });

  // Create or update business profile
  fastify.post('/websites/:websiteId/business-profile', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Create/update business profile',
      description: 'Create or update business profile for a website',
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

    const body = businessProfileSchema.parse(request.body);

    // Check if business profile exists
    const existingProfile = await queryOne<BusinessProfile>(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [websiteId]
    );

    let businessProfile;
    if (existingProfile) {
      // Update existing
      businessProfile = await queryOne<BusinessProfile>(
        `UPDATE business_profiles 
         SET business_name = $1, description = $2, industry = $3, target_audience = $4,
             brand_colors = $5, logo_url = $6, contact_info = $7, goals = $8
         WHERE website_id = $9
         RETURNING *`,
        [
          body.business_name,
          body.description,
          body.industry,
          body.target_audience,
          body.brand_colors ? JSON.stringify(body.brand_colors) : null,
          body.logo_url,
          body.contact_info ? JSON.stringify(body.contact_info) : null,
          body.goals ? JSON.stringify(body.goals) : null,
          websiteId,
        ]
      );
    } else {
      // Create new
      businessProfile = await queryOne<BusinessProfile>(
        `INSERT INTO business_profiles (website_id, business_name, description, industry, target_audience, brand_colors, logo_url, contact_info, goals)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          websiteId,
          body.business_name,
          body.description,
          body.industry,
          body.target_audience,
          body.brand_colors ? JSON.stringify(body.brand_colors) : null,
          body.logo_url,
          body.contact_info ? JSON.stringify(body.contact_info) : null,
          body.goals ? JSON.stringify(body.goals) : null,
        ]
      );

      // Update website with business_profile_id
      await query(
        'UPDATE websites SET business_profile_id = $1 WHERE id = $2',
        [businessProfile?.id, websiteId]
      );
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, existingProfile ? 'business_profile.updated' : 'business_profile.created', 'business_profile', businessProfile?.id, JSON.stringify({ website_id: websiteId })]
    );

    return reply.status(existingProfile ? 200 : 201).send({ business_profile: businessProfile });
  });

  // Get business profile
  fastify.get('/websites/:websiteId/business-profile', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Websites'],
      summary: 'Get business profile',
      description: 'Get business profile for a website',
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

    const businessProfile = await queryOne<BusinessProfile>(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [websiteId]
    );

    if (!businessProfile) {
      return reply.status(404).send({ error: 'Business profile not found' });
    }

    return { business_profile: businessProfile };
  });
}
