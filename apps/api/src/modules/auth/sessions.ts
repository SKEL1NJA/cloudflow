import type { Prisma, PrismaClient } from '@cloudflow/db';
import { randomBytes, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { sha256Hex } from '../../lib/crypto.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import type { SessionMeta } from './session-meta.js';

const DAY_MS = 86_400_000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  familyId: string;
}

export interface ActiveSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

async function insertToken(
  db: Prisma.TransactionClient,
  params: {
    userId: string;
    familyId: string;
    sessionExpiresAt: Date;
    nowMs: number;
    meta: SessionMeta;
  },
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
      userAgent: params.meta.userAgent,
      ipAddress: params.meta.ip,
    },
  });
  return { token, expiresAt, familyId: params.familyId };
}

export function startSession(
  prisma: PrismaClient,
  userId: string,
  meta: SessionMeta,
): Promise<IssuedRefreshToken> {
  const nowMs = Date.now();
  return insertToken(prisma, {
    userId,
    familyId: randomUUID(),
    sessionExpiresAt: new Date(nowMs + env.SESSION_MAX_DAYS * DAY_MS),
    nowMs,
    meta,
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
  meta: SessionMeta,
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
      meta,
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

export async function listActiveSessions(
  prisma: PrismaClient,
  userId: string,
): Promise<ActiveSession[]> {
  return prisma.$queryRaw<ActiveSession[]>`
    SELECT latest.family_id AS id,
           latest.user_agent AS "userAgent",
           latest.ip_address AS "ipAddress",
           origin.signed_in_at AS "signedInAt",
           latest.created_at AS "lastActiveAt",
           latest.session_expires_at AS "expiresAt"
    FROM (
      SELECT DISTINCT ON (family_id)
             family_id, user_agent, ip_address, created_at, expires_at, session_expires_at
      FROM refresh_tokens
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL
      ORDER BY family_id, created_at DESC
    ) latest
    JOIN (
      SELECT family_id, min(created_at) AS signed_in_at
      FROM refresh_tokens
      WHERE user_id = ${userId}::uuid
      GROUP BY family_id
    ) origin ON origin.family_id = latest.family_id
    WHERE latest.expires_at > now() AND latest.session_expires_at > now()
    ORDER BY latest.created_at DESC`;
}

export async function revokeSessionById(
  prisma: PrismaClient,
  userId: string,
  familyId: string,
): Promise<void> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    const existing = await prisma.refreshToken.findFirst({
      where: { userId, familyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Session not found');
  }
}

export async function revokeSessionsExcept(
  prisma: PrismaClient,
  userId: string,
  keepFamilyId: string | null,
): Promise<number> {
  const now = new Date();
  const others = keepFamilyId ? { familyId: { not: keepFamilyId } } : {};

  return prisma.$transaction(async (tx) => {
    const active = await tx.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        sessionExpiresAt: { gt: now },
        ...others,
      },
      distinct: ['familyId'],
      select: { familyId: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...others },
      data: { revokedAt: now },
    });
    return active.length;
  });
}
