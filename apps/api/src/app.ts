import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { safeRequestId } from './lib/request-id.js';
import { apiKeyRoutes } from './modules/api-keys/api-keys.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { executionRoutes } from './modules/executions/executions.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { logRoutes } from './modules/logs/logs.routes.js';
import { overviewRoutes } from './modules/overview/overview.routes.js';
import { queueRoutes } from './modules/queue/queue.routes.js';
import { workerRoutes } from './modules/workers/workers.routes.js';
import { workflowRoutes } from './modules/workflows/workflows.routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerDocs } from './plugins/docs.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerInfrastructure } from './plugins/infrastructure.js';
import { registerMetrics } from './plugins/metrics.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';

export interface AppOptions {
  rateLimitEnabled?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
    },
    bodyLimit: 256 * 1024,
    requestTimeout: 30_000,
    trustProxy: env.TRUST_PROXY,
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    genReqId: (request) => safeRequestId(request.headers['x-request-id']),
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    if (String(reply.getHeader('content-type') ?? '').startsWith('application/json')) {
      reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    }
    return payload;
  });

  void app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  void app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key'],
    exposedHeaders: ['x-request-id', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining'],
    maxAge: 600,
  });
  void app.register(cookie);

  registerErrorHandler(app);
  registerInfrastructure(app);
  void app.register(rateLimitPlugin, { enabled: options.rateLimitEnabled ?? env.RATE_LIMIT_ENABLED });
  registerAuth(app);
  registerMetrics(app);

  void app.register(healthRoutes);
  void app.register(authRoutes);
  void app.register(workflowRoutes);
  void app.register(executionRoutes);
  void app.register(overviewRoutes);
  void app.register(queueRoutes);
  void app.register(workerRoutes);
  void app.register(logRoutes);
  void app.register(apiKeyRoutes);

  if (env.DOCS_ENABLED ?? env.NODE_ENV !== 'production') {
    registerDocs(app);
  }

  return app;
}