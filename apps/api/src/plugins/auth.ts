import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { API_KEY_PREFIX, authenticateApiKey } from '../modules/api-keys/api-keys.service.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    authMethod: 'session' | 'apiKey' | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireSession: (request: FastifyRequest) => Promise<void>;
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('userId', null);
  app.decorateRequest('authMethod', null);

  app.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
    const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
    const token = match?.[1];
    if (!token) {
      throw new UnauthorizedError('Missing bearer token');
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      const userId = await authenticateApiKey(app.prisma, token);
      if (!userId) {
        throw new UnauthorizedError('Invalid or revoked API key');
      }
      request.userId = userId;
      request.authMethod = 'apiKey';
      return;
    }

    try {
      const { userId } = await verifyAccessToken(token);
      request.userId = userId;
      request.authMethod = 'session';
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  });

  app.decorate('requireSession', async (request: FastifyRequest): Promise<void> => {
    if (request.authMethod !== 'session') {
      throw new ForbiddenError('This endpoint requires a signed-in session, not an API key');
    }
  });
}

export function requireUserId(request: FastifyRequest): string {
  if (request.userId === null) {
    throw new UnauthorizedError();
  }
  return request.userId;
}