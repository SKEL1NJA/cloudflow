import { eventStreamQuerySchema, type EventTicketResponse } from '@cloudflow/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError, UnauthorizedError } from '../../lib/errors.js';
import { RULES } from '../../lib/rate-limit-rules.js';
import { requireUserId } from '../../plugins/auth.js';
import { MAX_STREAMS_PER_USER } from './event-hub.js';
import { TICKET_TTL_SECONDS, issueTicket, redeemTicket } from './event-tickets.js';

async function resolveUser(
  app: FastifyInstance,
  request: FastifyRequest,
  ticket: string | undefined,
): Promise<string> {
  if (request.headers.authorization) {
    await app.authenticate(request);
    return requireUserId(request);
  }
  if (ticket) {
    const userId = await redeemTicket(app.redis, ticket);
    if (userId) return userId;
    throw new UnauthorizedError('Invalid or expired ticket');
  }
  throw new UnauthorizedError('Missing credentials');
}

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/events/ticket',
    { onRequest: app.authenticate, preHandler: app.limiter.byUser(RULES.eventTicket) },
    async (request): Promise<EventTicketResponse> => {
      const ticket = await issueTicket(app.redis, requireUserId(request));
      return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
    },
  );

  app.get('/events', async (request, reply) => {
    const query = eventStreamQuerySchema.parse(request.query);
    const userId = await resolveUser(app, request, query.ticket);

    if (!app.eventHub.canAccept(userId)) {
      throw new AppError(
        429,
        'TOO_MANY_STREAMS',
        `At most ${MAX_STREAMS_PER_USER} event streams can be open at once`,
        undefined,
        { 'retry-after': '5' },
      );
    }

    const header = request.headers['last-event-id'];
    const lastEventId = typeof header === 'string' && header !== '' ? header : query.lastEventId;

    reply.hijack();
    
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    await app.eventHub.attach(userId, reply.raw, lastEventId);
  });
};