import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../../lib/errors.js';
import type { IssuedRefreshToken } from './sessions.js';

export const REFRESH_COOKIE = 'cf_refresh';

const baseOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth',
} as const;

export function setRefreshCookie(reply: FastifyReply, issued: IssuedRefreshToken): void {
  const maxAge = Math.max(1, Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(REFRESH_COOKIE, issued.token, { ...baseOptions, maxAge });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, baseOptions);
}

export function assertTrustedOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (origin !== undefined && !env.CORS_ORIGINS.includes(origin)) {
    throw new ForbiddenError('Origin not allowed');
  }
}