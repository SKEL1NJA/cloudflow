import type { Prisma, PrismaClient } from '@cloudflow/db';
import { randomBytes, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { sha256Hex } from '../../lib/crypto.js';
import { UnauthorizedError } from '../../lib/errors.js';

const DAY_MS = 86_400_000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

async function insertToken(
  db: Prisma.TransactionClient,
  params: { userId: string; familyId: string; sessionExpiresAt: Date; nowMs: number },
): Promise<IssuedRefreshToken> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(
    Math.min(params.nowMs + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS, params.sessionExpiresAt.getTime()),
  );
  await db.refreshToken.create({
    data: {
      userId: params.userId,
      familyId: params.familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt,
      sessionExpiresAt: params.sessionExpiresAt,
    },
  });
  return { token, expiresAt };
}

export function startSession(prisma: PrismaClient, userId: string): Promise<IssuedRefreshToken> {
  const nowMs = Date.now();
  return insertToken(prisma, {
    userId,
    familyId: randomUUID(),
    sessionExpiresAt: new Date(nowMs + env.SESSION_MAX_DAYS * DAY_MS),
    nowMs,
  });
}

function revokeFamily(prisma: PrismaClient, familyId: string) {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateSession(
  prisma: PrismaClient,
  presented: string,
): Promise<{ userId: string; issued: IssuedRefreshToken }> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
  });
  const now = new Date();
  if (!row || row.revokedAt || row.expiresAt <= now || row.sessionExpiresAt <= now) {
    throw new UnauthorizedError('Session expired, please sign in again');
  }

  const issued = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return null;
    return insertToken(tx, {
      userId: row.userId,
      familyId: row.familyId,
      sessionExpiresAt: row.sessionExpiresAt,
      nowMs: now.getTime(),
    });
  });

  if (!issued) {
    await revokeFamily(prisma, row.familyId);
    throw new UnauthorizedError('Session expired, please sign in again');
  }
  return { userId: row.userId, issued };
}

export async function revokeSession(prisma: PrismaClient, presented: string): Promise<void> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    select: { familyId: true },
  });
  if (row) await revokeFamily(prisma, row.familyId);
}

export async function revokeAllSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
