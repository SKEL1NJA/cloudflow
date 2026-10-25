import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pruneRefreshTokens } from '../src/maintenance.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createPrismaClient(process.env.DATABASE_URL as string);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.user.deleteMany();
});

describe('pruneRefreshTokens', () => {
  it('deletes tokens that expired more than a day ago and keeps everything else', async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    const hours = (count: number) => new Date(Date.now() + count * 3_600_000);
    const create = (expiresAt: Date) =>
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          tokenHash: randomBytes(16).toString('hex'),
          expiresAt,
          sessionExpiresAt: hours(24 * 30),
        },
      });

    const longExpired = await create(hours(-72));
    const recentlyExpired = await create(hours(-1));
    const valid = await create(hours(24));

    expect(await pruneRefreshTokens(prisma)).toBe(1);

    const remaining = await prisma.refreshToken.findMany({ select: { id: true } });
    expect(remaining.map((row) => row.id).sort()).toEqual([recentlyExpired.id, valid.id].sort());
    expect(remaining.some((row) => row.id === longExpired.id)).toBe(false);
  });
});
