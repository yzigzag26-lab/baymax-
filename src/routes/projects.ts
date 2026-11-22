import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { planMiddleware, checkProjectLimit } from '../middleware/rbac';
import { query, queryOne } from '../db';
import { Project } from '../types';

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
});

export async function projectRoutes(fastify: FastifyInstance) {
  // Get all projects for authenticated user
  fastify.get('/projects', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Projects'],
      summary: 'Get all projects',
      description: 'Retrieve all projects for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const projects = await query<Project>(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    );

    return { projects };
  });

  // Get single project
  fastify.get('/projects/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Projects'],
      summary: 'Get project by ID',
      description: 'Retrieve a specific project by ID',
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

    const project = await queryOne<Project>(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return { project };
  });

  // Create new project
  fastify.post('/projects', {
    preHandler: [authMiddleware, planMiddleware, checkProjectLimit],
    schema: {
      tags: ['Projects'],
      summary: 'Create project',
      description: 'Create a new project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 1000 },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const body = createProjectSchema.parse(request.body);

    const project = await queryOne<Project>(
      `INSERT INTO projects (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user.id, body.name, body.description]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'project.created', 'project', project?.id, JSON.stringify({ name: body.name })]
    );

    return reply.status(201).send({ project });
  });

  // Update project
  fastify.patch('/projects/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Projects'],
      summary: 'Update project',
      description: 'Update an existing project',
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

    const body = updateProjectSchema.parse(request.body);

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [id, user.id];
    let paramIndex = 3;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }
    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const project = await queryOne<Project>(
      `UPDATE projects 
       SET ${updates.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'project.updated', 'project', id, JSON.stringify(body)]
    );

    return { project };
  });

  // Delete project (soft delete)
  fastify.delete('/projects/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Projects'],
      summary: 'Delete project',
      description: 'Soft delete a project',
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

    const project = await queryOne<Project>(
      `UPDATE projects 
       SET status = 'deleted'
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, user.id]
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'project.deleted', 'project', id, JSON.stringify({})]
    );

    return { message: 'Project deleted successfully' };
  });
}
