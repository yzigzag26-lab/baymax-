import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { config } from './config';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { templateRoutes } from './routes/templates';
import { blueprintRoutes } from './routes/blueprints';
import { websiteRoutes } from './routes/websites';
import { jobRoutes } from './routes/jobs';
import { versionRoutes } from './routes/versions';
import { previewRoutes } from './routes/previews';
import { usageRoutes } from './routes/usage';
import { aiRoutes } from './routes/ai';
import { jobProcessor } from './jobs/processor';

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register plugins
await fastify.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

await fastify.register(helmet, {
  contentSecurityPolicy: false,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Baymax API',
      description: 'Baymax AI Website Builder Backend API',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
});

// Error handler
fastify.setErrorHandler(errorHandler);

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Root route
fastify.get('/', async () => {
  return {
    name: 'Baymax Backend API',
    version: '1.0.0',
    docs: '/docs',
  };
});

// Register routes
await fastify.register(authRoutes, { prefix: '/api/v1' });
await fastify.register(projectRoutes, { prefix: '/api/v1' });
await fastify.register(templateRoutes, { prefix: '/api/v1' });
await fastify.register(blueprintRoutes, { prefix: '/api/v1' });
await fastify.register(websiteRoutes, { prefix: '/api/v1' });
await fastify.register(jobRoutes, { prefix: '/api/v1' });
await fastify.register(versionRoutes, { prefix: '/api/v1' });
await fastify.register(previewRoutes, { prefix: '/api/v1' });
await fastify.register(usageRoutes, { prefix: '/api/v1' });
await fastify.register(aiRoutes, { prefix: '/api/v1' });

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${config.port}`);
    fastify.log.info(`API Documentation: http://localhost:${config.port}/docs`);
    
    // Start job processor
    jobProcessor.start();
    fastify.log.info('Job processor started');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
