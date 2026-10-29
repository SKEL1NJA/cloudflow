import type { FastifyRequest } from 'fastify';

const MAX_USER_AGENT = 300;

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export function sessionMeta(request: FastifyRequest): SessionMeta {
  const userAgent = request.headers['user-agent'];
  return {
    userAgent:
      typeof userAgent === 'string' && userAgent !== '' ? userAgent.slice(0, MAX_USER_AGENT) : null,
    ip: request.ip,
  };
}
