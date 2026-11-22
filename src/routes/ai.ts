import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { planMiddleware, checkAIRequestLimit } from '../middleware/rbac';
import { AIGatewayService } from '../services/ai-gateway.service';
import { AIProviderService } from '../services/ai-provider.service';
import { UsageService } from '../services/usage.service';
import { ArtifactService } from '../services/artifact.service';
import { query, queryOne } from '../db';
import { PlanTier } from '../types';

const generateRequestSchema = z.object({
  website_id: z.string().uuid(),
  blueprint_id: z.string().uuid().optional(),
});

const editRequestSchema = z.object({
  website_id: z.string().uuid(),
  edit_request: z.string().min(1),
  version_id: z.string().uuid().optional(),
});

const seoRequestSchema = z.object({
  website_id: z.string().uuid(),
  keywords: z.array(z.string()).min(1),
});

const planRequestSchema = z.object({
  website_id: z.string().uuid(),
  brief: z.string().min(10),
});

export async function aiRoutes(fastify: FastifyInstance) {
  // Generate website Blueprint/plan (planner role)
  fastify.post('/ai/plan', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Generate website plan',
      description: 'Use AI to generate a website Blueprint from a business brief',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          brief: { type: 'string', minLength: 10 },
        },
        required: ['website_id', 'brief'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, brief } = planRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    const businessProfile = await queryOne(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [website_id]
    );

    try {
      const response = await AIGatewayService.generateBlueprintPlan(
        user.id,
        planTier as PlanTier,
        brief,
        businessProfile
      );

      const planJson = JSON.parse(response.content);

      const versionResult = await queryOne<{ max_version: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 as max_version FROM blueprints WHERE website_id = $1',
        [website_id]
      );
      const version = versionResult?.max_version || 1;

      const blueprint = await queryOne(
        `INSERT INTO blueprints (website_id, version, status, sitemap, pages, design_tokens, components, content_plan, seo_fields, integrations, constraints)
         VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          website_id,
          version,
          JSON.stringify(planJson.sitemap ?? {}),
          JSON.stringify(planJson.pages ?? []),
          JSON.stringify(planJson.design_tokens ?? {}),
          JSON.stringify(planJson.components ?? []),
          JSON.stringify(planJson.content_plan ?? {}),
          JSON.stringify(planJson.seo_fields ?? null),
          JSON.stringify(planJson.integrations ?? null),
          JSON.stringify(planJson.constraints ?? null),
        ]
      );

      await UsageService.trackEvent(
        user.id,
        'blueprint_generated',
        {
          website_id,
          blueprint_id: blueprint?.id,
          version,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      await query(
        `INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'blueprint.ai_generated', 'blueprint', blueprint?.id, JSON.stringify({ website_id, version })]
      );

      return {
        success: true,
        blueprint,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI planning error:', error);
      return reply.status(500).send({
        error: 'AI Planning Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Generate website from blueprint
  fastify.post('/ai/generate', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Generate website',
      description: 'Generate website code from blueprint using AI',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          blueprint_id: { type: 'string', format: 'uuid' },
        },
        required: ['website_id'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, blueprint_id } = generateRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get blueprint
    let blueprint;
    if (blueprint_id) {
      blueprint = await queryOne(
        'SELECT * FROM blueprints WHERE id = $1 AND website_id = $2',
        [blueprint_id, website_id]
      );
    } else {
      blueprint = await queryOne(
        'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC LIMIT 1',
        [website_id]
      );
    }

    if (!blueprint) {
      return reply.status(404).send({ error: 'Blueprint not found' });
    }

    if (blueprint.status !== 'approved') {
      return reply.status(400).send({
        error: 'Blueprint Not Approved',
        message: 'Blueprint must be approved before website generation',
      });
    }

    // Get business profile
    const businessProfile = await queryOne(
      'SELECT * FROM business_profiles WHERE website_id = $1',
      [website_id]
    );

    try {
      const response = await AIGatewayService.generateWebsite(
        user.id,
        planTier as PlanTier,
        blueprint,
        businessProfile
      );

      // Parse the file map from the AI response
      let files: Record<string, string> = {};
      try {
        const parsed = JSON.parse(response.content);
        files = parsed.files && typeof parsed.files === 'object' ? parsed.files : {};
      } catch {
        return reply.status(502).send({
          error: 'Invalid AI Output',
          message: 'AI provider returned malformed file map',
        });
      }

      if (Object.keys(files).length === 0) {
        return reply.status(502).send({
          error: 'Empty AI Output',
          message: 'AI provider returned no files',
        });
      }

      // Persist the generated source as an artifact
      const artifact = await ArtifactService.createArtifact({
        websiteId: website_id,
        files,
        userId: user.id,
        type: 'source',
        metadata: {
          blueprint_id: blueprint.id,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
        },
      });

      // Create a website version pointing at the artifact
      const versionResult = await queryOne<{ max_version: number }>(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as max_version FROM website_versions WHERE website_id = $1',
        [website_id]
      );
      const versionNumber = versionResult?.max_version || 1;

      const version = await queryOne(
        `INSERT INTO website_versions (website_id, version_number, blueprint_id, source_artifact_id, origin, change_summary, created_by)
         VALUES ($1, $2, $3, $4, 'generation', $5, $6)
         RETURNING *`,
        [
          website_id,
          versionNumber,
          blueprint.id,
          artifact.id,
          `AI-generated website from blueprint v${blueprint.version}`,
          user.id,
        ]
      );

      await query(
        'UPDATE websites SET current_version_id = $1 WHERE id = $2',
        [version?.id, website_id]
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'website_generated',
        {
          website_id,
          blueprint_id: blueprint.id,
          version_id: version?.id,
          artifact_id: artifact.id,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
          file_count: Object.keys(files).length,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        files,
        version,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI generation error:', error);
      return reply.status(500).send({
        error: 'AI Generation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Edit website
  fastify.post('/ai/edit', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Edit website',
      description: 'Edit website code using AI based on user request',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          edit_request: { type: 'string', minLength: 1 },
          version_id: { type: 'string', format: 'uuid' },
        },
        required: ['website_id', 'edit_request'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, edit_request, version_id } = editRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get latest version and its source artifact
    const latestVersion = await queryOne(
      'SELECT * FROM website_versions WHERE website_id = $1 ORDER BY version_number DESC LIMIT 1',
      [website_id]
    );

    const artifact = latestVersion?.source_artifact_id
      ? await ArtifactService.getArtifactById(latestVersion.source_artifact_id)
      : await ArtifactService.getLatestArtifact(website_id);

    if (!artifact) {
      return reply.status(400).send({
        error: 'No Source Code',
        message: 'Website has no generated source to edit. Generate the website first.',
      });
    }

    const currentCode = ArtifactService.serializeFilesForPrompt(artifact.files);

    // Get blueprint
    const blueprint = await queryOne(
      'SELECT * FROM blueprints WHERE website_id = $1 ORDER BY version DESC LIMIT 1',
      [website_id]
    );

    try {
      const response = await AIGatewayService.editWebsite(
        user.id,
        planTier as PlanTier,
        currentCode,
        edit_request,
        blueprint
      );

      // Parse edited file map
      let files: Record<string, string> = {};
      try {
        const parsed = JSON.parse(response.content);
        files = parsed.files && typeof parsed.files === 'object' ? parsed.files : {};
      } catch {
        return reply.status(502).send({
          error: 'Invalid AI Output',
          message: 'AI provider returned malformed file map',
        });
      }

      if (Object.keys(files).length === 0) {
        return reply.status(502).send({
          error: 'Empty AI Output',
          message: 'AI provider returned no files',
        });
      }

      // Persist edited source as a new artifact + version
      const newArtifact = await ArtifactService.createArtifact({
        websiteId: website_id,
        files,
        userId: user.id,
        type: 'source',
        metadata: {
          edit_request,
          parent_artifact_id: artifact.id,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
        },
      });

      const versionResult = await queryOne<{ max_version: number }>(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as max_version FROM website_versions WHERE website_id = $1',
        [website_id]
      );
      const versionNumber = versionResult?.max_version || 1;

      const version = await queryOne(
        `INSERT INTO website_versions (website_id, version_number, blueprint_id, source_artifact_id, parent_version_id, origin, change_summary, created_by)
         VALUES ($1, $2, $3, $4, $5, 'chat', $6, $7)
         RETURNING *`,
        [
          website_id,
          versionNumber,
          latestVersion?.blueprint_id || blueprint?.id || null,
          newArtifact.id,
          latestVersion?.id || null,
          `AI edit: ${edit_request.slice(0, 200)}`,
          user.id,
        ]
      );

      await query(
        'UPDATE websites SET current_version_id = $1 WHERE id = $2',
        [version?.id, website_id]
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'website_edited',
        {
          website_id,
          version_id: version?.id,
          artifact_id: newArtifact.id,
          edit_request,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        files,
        version,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI edit error:', error);
      return reply.status(500).send({
        error: 'AI Edit Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Optimize SEO
  fastify.post('/ai/seo', {
    preHandler: [authMiddleware, planMiddleware, checkAIRequestLimit],
    schema: {
      tags: ['AI'],
      summary: 'Optimize SEO',
      description: 'Optimize website SEO using AI',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          website_id: { type: 'string', format: 'uuid' },
          keywords: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        required: ['website_id', 'keywords'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { website_id, keywords } = seoRequestSchema.parse(request.body);
    const planTier = request.userPlanTier || user.plan_tier || 'free';

    // Check if user has SEO entitlement
    if (planTier === 'free') {
      return reply.status(403).send({
        error: 'SEO Feature Not Available',
        message: 'SEO optimization requires Business or Pro plan',
      });
    }

    // Get website
    const website = await queryOne(
      'SELECT * FROM websites WHERE id = $1 AND user_id = $2',
      [website_id, user.id]
    );

    if (!website) {
      return reply.status(404).send({ error: 'Website not found' });
    }

    // Get latest source artifact for real content
    const artifact = await ArtifactService.getLatestArtifact(website_id);
    const websiteContent = artifact
      ? ArtifactService.serializeFilesForPrompt(artifact.files)
      : `Website: ${website.name}`;

    try {
      const response = await AIGatewayService.optimizeSEO(
        user.id,
        planTier as PlanTier,
        websiteContent,
        keywords
      );

      // Track usage
      await UsageService.trackEvent(
        user.id,
        'seo_optimization',
        {
          website_id,
          keywords,
          provider: response.gatewayMetadata.provider,
          model: response.gatewayMetadata.model,
          cost: response.gatewayMetadata.cost,
        },
        undefined,
        website_id
      );

      return {
        success: true,
        seo_recommendations: response.content,
        metadata: response.gatewayMetadata,
      };
    } catch (error) {
      request.log.error('AI SEO error:', error);
      return reply.status(500).send({
        error: 'AI SEO Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get AI usage statistics
  fastify.get('/ai/usage', {
    preHandler: [authMiddleware, planMiddleware],
    schema: {
      tags: ['AI'],
      summary: 'Get AI usage statistics',
      description: 'Get AI usage statistics for the authenticated user',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { days = 30 } = request.query as { days?: number };

    const stats = await AIGatewayService.getUsageStats(user.id, days);

    const maxDaily = request.userPlan?.max_ai_requests_per_day ?? 0;

    return {
      stats,
      limits: {
        daily_requests: maxDaily === -1 ? 'unlimited' : maxDaily,
        plan_tier: request.userPlan?.plan_tier || 'free',
      },
    };
  });

  // Get available AI providers
  fastify.get('/ai/providers', {
    preHandler: authMiddleware,
    schema: {
      tags: ['AI'],
      summary: 'Get available AI providers',
      description: 'Get list of configured AI providers',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const providers = AIProviderService.getAvailableProviders();

    return {
      providers: providers.map(p => ({
        provider: p.provider,
        model: p.model,
        available: true,
      })),
    };
  });

  // Check AI provider health
  fastify.get('/ai/health', {
    preHandler: authMiddleware,
    schema: {
      tags: ['AI'],
      summary: 'Check AI provider health',
      description: 'Check health status of AI providers',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const health = await AIGatewayService.checkProviderHealth();

    return {
      health,
      timestamp: new Date().toISOString(),
    };
  });
}
