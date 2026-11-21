import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { projectRoutes } from './routes/projects';
import { templateRoutes } from './routes/templates';
import { blueprintRoutes } from './routes/blueprints';

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

await fastify.register(jwt, {
  secret: config.jwtSecret,
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
await fastify.register(projectRoutes, { prefix: '/api/v1' });
await fastify.register(templateRoutes, { prefix: '/api/v1' });
await fastify.register(blueprintRoutes, { prefix: '/api/v1' });

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${config.port}`);
    fastify.log.info(`API Documentation: http://localhost:${config.port}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
