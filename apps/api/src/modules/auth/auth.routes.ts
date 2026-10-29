import type { FastifyPluginAsync } from 'fastify';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { sha256Hex } from '../../lib/crypto.js';
import { ConflictError, RateLimitError, UnauthorizedError } from '../../lib/errors.js';
import { RULES } from '../../lib/rate-limit-rules.js';
import { requireUserId } from '../../plugins/auth.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import {
  REFRESH_COOKIE,
  assertTrustedOrigin,
  clearRefreshCookie,
  setRefreshCookie,
} from './cookies.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from './password.js';
import { toPublicUser } from './public-user.js';
import { sessionMeta } from './session-meta.js';
import { revokeAllSessions, revokeSession, rotateSession, startSession } from './sessions.js';
import { signAccessToken } from './tokens.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/auth/register',
    { onRequest: app.limiter.byIp(RULES.register) },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);
      const passwordHash = await hashPassword(input.password);

      try {
        const user = await app.prisma.user.create({
          data: { email: input.email, passwordHash, name: input.name },
        });
        const session = await startSession(app.prisma, user.id, sessionMeta(request));
        const accessToken = await signAccessToken(user.id, session.familyId);
        setRefreshCookie(reply, session);
        return reply.status(201).send({ user: toPublicUser(user), accessToken });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError('An account with this email already exists');
        }
        throw err;
      }
    },
  );

  app.post('/auth/login', { onRequest: app.limiter.byIp(RULES.login) }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const pairRule = RULES.loginFailuresByIpAndEmail;
    const ipRule = RULES.loginFailuresByIp;
    const pairKey = `${request.ip}:${sha256Hex(input.email)}`;

    const [pair, byIp] = await Promise.all([
      app.limiter.peek(pairRule, pairKey),
      app.limiter.peek(ipRule, request.ip),
    ]);
    if (pair.count >= pairRule.max || byIp.count >= ipRule.max) {
      throw new RateLimitError(
        Math.max(pair.retryAfterSeconds, byIp.retryAfterSeconds),
        'Too many failed sign-in attempts. Try again later.',
      );
    }

    const user = await app.prisma.user.findUnique({ where: { email: input.email } });
    let valid = false;
    if (user) {
      valid = await verifyPassword(user.passwordHash, input.password);
    } else {
      await burnPasswordCheck(input.password);
    }

    if (!user || !valid) {
      await Promise.all([
        app.limiter.consume(pairRule, pairKey),
        app.limiter.consume(ipRule, request.ip),
      ]);
      throw new UnauthorizedError('Invalid email or password');
    }

    await app.limiter.reset(pairRule, pairKey);
    const session = await startSession(app.prisma, user.id, sessionMeta(request));
    const accessToken = await signAccessToken(user.id, session.familyId);
    setRefreshCookie(reply, session);
    return { user: toPublicUser(user), accessToken };
  });

  app.post(
    '/auth/refresh',
    { onRequest: app.limiter.byIp(RULES.refresh) },
    async (request, reply) => {
      assertTrustedOrigin(request);
      const presented = request.cookies[REFRESH_COOKIE];

      if (presented) {
        try {
          const { userId, issued } = await rotateSession(
            app.prisma,
            presented,
            sessionMeta(request),
          );
          const user = await app.prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            setRefreshCookie(reply, issued);
            return {
              user: toPublicUser(user),
              accessToken: await signAccessToken(user.id, issued.familyId),
            };
          }
        } catch (err) {
          if (!(err instanceof UnauthorizedError)) throw err;
        }
      }

      clearRefreshCookie(reply);
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Session expired, please sign in again' },
      });
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    assertTrustedOrigin(request);
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) await revokeSession(app.prisma, presented);
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });

  app.post(
    '/auth/logout-all',
    { onRequest: [app.authenticate, app.requireSession] },
    async (request, reply) => {
      await revokeAllSessions(app.prisma, requireUserId(request));
      clearRefreshCookie(reply);
      return reply.status(204).send();
    },
  );

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: requireUserId(request) } });
    if (!user) {
      throw new UnauthorizedError('Account no longer exists');
    }
    return { user: toPublicUser(user) };
  });
};
