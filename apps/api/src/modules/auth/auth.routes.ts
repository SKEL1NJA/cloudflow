import type { FastifyPluginAsync } from 'fastify';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { requireUserId } from '../../plugins/auth.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { signAccessToken } from './tokens.js';

interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await app.prisma.user.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      const accessToken = await signAccessToken(user.id);
      return reply.status(201).send({ user: toPublicUser(user), accessToken });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('An account with this email already exists');
      }
      throw err;
    }
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      await burnPasswordCheck(input.password);
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = await signAccessToken(user.id);
    return { user: toPublicUser(user), accessToken };
  });

  app.get(
    '/auth/me',
    { preHandler: app.authenticate },
    async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: requireUserId(request) },
      });

      if (!user) {
        throw new UnauthorizedError('Account no longer exists');
      }

      return { user: toPublicUser(user) };
    },
  );
};
