import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordResponse,
  type SessionListResponse,
} from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, UnauthorizedError } from '../../lib/errors.js';
import { RULES } from '../../lib/rate-limit-rules.js';
import { requireUserId } from '../../plugins/auth.js';
import { hashPassword, verifyPassword } from './password.js';
import { toPublicUser } from './public-user.js';
import { listActiveSessions, revokeSessionById, revokeSessionsExcept } from './sessions.js';

const idParamsSchema = z.object({ id: z.uuid() });

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireSession);

  app.patch('/auth/me', async (request) => {
    const { name } = updateProfileSchema.parse(request.body);
    const user = await app.prisma.user.update({
      where: { id: requireUserId(request) },
      data: { name: name === '' ? null : name },
    });
    return { user: toPublicUser(user) };
  });

  app.post(
    '/auth/change-password',
    { preHandler: app.limiter.byUser(RULES.changePassword) },
    async (request): Promise<ChangePasswordResponse> => {
      const input = changePasswordSchema.parse(request.body);
      const userId = requireUserId(request);

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new UnauthorizedError('Account no longer exists');
      }
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Your current password is incorrect');
      }

      const passwordHash = await hashPassword(input.newPassword);
      await app.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
      const revokedSessions = await revokeSessionsExcept(app.prisma, userId, request.sessionId);
      return { revokedSessions };
    },
  );

  app.get('/auth/sessions', async (request): Promise<SessionListResponse> => {
    const sessions = await listActiveSessions(app.prisma, requireUserId(request));
    return {
      data: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        signedInAt: session.signedInAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === request.sessionId,
      })),
    };
  });

  app.delete('/auth/sessions/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await revokeSessionById(app.prisma, requireUserId(request), id);
    return reply.status(204).send();
  });
};
