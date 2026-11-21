import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../db';
import { WebsiteVersion } from '../types';

const createVersionSchema = z.object({
  blueprint_id: z.string().uuid().optional(),
  source_artifact_id: z.string().uuid().optional(),
  build_result_id: z.string().uuid().optional(),
  parent_version_id: z.string().uuid().optional(),
  origin: z.enum(['generation', 'chat', 'visual', 'upgrade', 'manual']),
  change_summary: z.string().max(500).optional(),
});

export async function versionRoutes(fastify: FastifyInstance) {
  // Get all versions for website
  fastify.get('/websites/:websiteId/versions', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Versions'],
      summary: 'Get website versions',
      description: 'Get all versions for a website',
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

    const versions = await query<WebsiteVersion>(
      `SELECT v.*, u.email as created_by_email
       FROM website_versions v
       JOIN users u ON v.created_by = u.id
       WHERE v.website_id = $1
       ORDER BY v.version_number DESC`,
      [websiteId]
    );

    return { versions };
  });

  // Get single version
  fastify.get('/versions/:id', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Versions'],
      summary: 'Get version by ID',
      description: 'Retrieve a specific version by ID',
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

    const version = await queryOne<WebsiteVersion>(
      `SELECT v.*, u.email as created_by_email
       FROM website_versions v
       JOIN users u ON v.created_by = u.id
       JOIN websites w ON v.website_id = w.id
       WHERE v.id = $1 AND w.user_id = $2`,
      [id, user.id]
    );

    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    return { version };
  });

  // Create new version
  fastify.post('/websites/:websiteId/versions', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Versions'],
      summary: 'Create version',
      description: 'Create a new version for a website',
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
          blueprint_id: { type: 'string', format: 'uuid' },
          source_artifact_id: { type: 'string', format: 'uuid' },
          build_result_id: { type: 'string', format: 'uuid' },
          parent_version_id: { type: 'string', format: 'uuid' },
          origin: { type: 'string', enum: ['generation', 'chat', 'visual', 'upgrade', 'manual'] },
          change_summary: { type: 'string', maxLength: 500 },
        },
        required: ['origin'],
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

    const body = createVersionSchema.parse(request.body);

    // Get next version number
    const versionResult = await queryOne<{ max_version: number }>(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as max_version FROM website_versions WHERE website_id = $1',
      [websiteId]
    );
    const versionNumber = versionResult?.max_version || 1;

    // If no parent specified, use current version as parent
    let parentVersionId = body.parent_version_id;
    if (!parentVersionId && website.current_version_id) {
      parentVersionId = website.current_version_id;
    }

    const version = await queryOne<WebsiteVersion>(
      `INSERT INTO website_versions (website_id, version_number, blueprint_id, source_artifact_id, build_result_id, parent_version_id, origin, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        websiteId,
        versionNumber,
        body.blueprint_id || null,
        body.source_artifact_id || null,
        body.build_result_id || null,
        parentVersionId || null,
        body.origin,
        body.change_summary || null,
        user.id,
      ]
    );

    // Update website's current version
    await query(
      'UPDATE websites SET current_version_id = $1 WHERE id = $2',
      [version?.id, websiteId]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'version.created', 'version', version?.id, JSON.stringify({ website_id: websiteId, version_number: versionNumber, origin: body.origin })]
    );

    return reply.status(201).send({ version });
  });

  // Rollback to version
  fastify.post('/websites/:websiteId/versions/:versionId/rollback', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Versions'],
      summary: 'Rollback to version',
      description: 'Rollback website to a previous version',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          websiteId: { type: 'string', format: 'uuid' },
          versionId: { type: 'string', format: 'uuid' },
        },
        required: ['websiteId', 'versionId'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { websiteId, versionId } = request.params as { websiteId: string; versionId: string };

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

    // Get the version to rollback to
    const targetVersion = await queryOne<WebsiteVersion>(
      'SELECT * FROM website_versions WHERE id = $1 AND website_id = $2',
      [versionId, websiteId]
    );

    if (!targetVersion) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    // Get next version number
    const versionResult = await queryOne<{ max_version: number }>(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as max_version FROM website_versions WHERE website_id = $1',
      [websiteId]
    );
    const newVersionNumber = versionResult?.max_version || 1;

    // Create new version based on target version
    const newVersion = await queryOne<WebsiteVersion>(
      `INSERT INTO website_versions (website_id, version_number, blueprint_id, source_artifact_id, build_result_id, parent_version_id, origin, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        websiteId,
        newVersionNumber,
        targetVersion.blueprint_id,
        targetVersion.source_artifact_id,
        targetVersion.build_result_id,
        targetVersion.id,
        'manual',
        `Rollback to version ${targetVersion.version_number}`,
        user.id,
      ]
    );

    // Update website's current version
    await query(
      'UPDATE websites SET current_version_id = $1 WHERE id = $2',
      [newVersion?.id, websiteId]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'version.rollback', 'version', newVersion?.id, JSON.stringify({ website_id: websiteId, rolled_back_to: versionId, new_version: newVersionNumber })]
    );

    // TODO: Trigger rebuild/preview generation (to be implemented)

    return {
      message: 'Rollback initiated successfully',
      version: newVersion,
      rolled_back_to: targetVersion,
    };
  });

  // Get version history with diffs
  fastify.get('/websites/:websiteId/versions/:versionId/diff', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Versions'],
      summary: 'Get version diff',
      description: 'Get diff between two versions',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          websiteId: { type: 'string', format: 'uuid' },
          versionId: { type: 'string', format: 'uuid' },
        },
        required: ['websiteId', 'versionId'],
      },
      querystring: {
        type: 'object',
        properties: {
          compare_to: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    const { websiteId, versionId } = request.params as { websiteId: string; versionId: string };
    const { compare_to } = request.query as { compare_to?: string };

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

    // Get current version
    const currentVersion = await queryOne<WebsiteVersion>(
      'SELECT * FROM website_versions WHERE id = $1 AND website_id = $2',
      [versionId, websiteId]
    );

    if (!currentVersion) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    // Get comparison version (previous by default)
    let compareVersion;
    if (compare_to) {
      compareVersion = await queryOne<WebsiteVersion>(
        'SELECT * FROM website_versions WHERE id = $1 AND website_id = $2',
        [compare_to, websiteId]
      );
    } else {
      compareVersion = await queryOne<WebsiteVersion>(
        `SELECT * FROM website_versions 
         WHERE website_id = $1 AND version_number < $2
         ORDER BY version_number DESC 
         LIMIT 1`,
        [websiteId, currentVersion.version_number]
      );
    }

    if (!compareVersion) {
      return reply.status(404).send({ error: 'Comparison version not found' });
    }

    // TODO: Implement actual diff logic (to be implemented)
    // For now, return basic metadata
    return {
      current_version: currentVersion,
      compare_version: compareVersion,
      diff: {
        blueprint_changed: currentVersion.blueprint_id !== compareVersion.blueprint_id,
        source_changed: currentVersion.source_artifact_id !== compareVersion.source_artifact_id,
        build_changed: currentVersion.build_result_id !== compareVersion.build_result_id,
        origin: currentVersion.origin,
        change_summary: currentVersion.change_summary,
      },
    };
  });
}
