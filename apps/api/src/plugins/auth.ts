import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('userId', null);

  app.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
    const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1]) {
      throw new UnauthorizedError('Missing bearer token');
    }
    try {
      const { userId } = await verifyAccessToken(match[1]);
      request.userId = userId;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  });
}

export function requireUserId(request: FastifyRequest): string {
  if (request.userId === null) {
    throw new UnauthorizedError();
  }
  return request.userId;
}