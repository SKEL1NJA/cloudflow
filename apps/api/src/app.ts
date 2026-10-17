import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerInfrastructure } from './plugins/infrastructure.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
    },
    requestIdHeader: 'x-request-id',
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    genReqId: () => randomUUID(),
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app);
  registerInfrastructure(app);
  registerAuth(app);

  void app.register(healthRoutes);
  void app.register(authRoutes);

  return app;
}
