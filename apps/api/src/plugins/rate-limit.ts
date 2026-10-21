import fp from 'fastify-plugin';
import { createRateLimiter, type RateLimiter } from '../lib/rate-limiter.js';
import { RULES } from '../lib/rate-limit-rules.js';

declare module 'fastify' {
  interface FastifyInstance {
    limiter: RateLimiter;
  }
}

const EXEMPT_PREFIXES = ['/health', '/metrics', '/docs'];

export const rateLimitPlugin = fp<{ enabled: boolean }>(async (app, options) => {
  const limiter = createRateLimiter(app.redis, options.enabled, app.log);
  app.decorate('limiter', limiter);

  const enforceGlobal = limiter.byIp(RULES.global);
  app.addHook('onRequest', async (request, reply) => {
    if (EXEMPT_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;
    await enforceGlobal(request, reply);
  });
});