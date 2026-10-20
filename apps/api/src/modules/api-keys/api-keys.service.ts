import type { PrismaClient } from '@cloudflow/db';
import type { ApiKeyView, CreatedApiKey } from '@cloudflow/shared';
import { createHash, randomBytes } from 'node:crypto';
import { AppError, NotFoundError } from '../../lib/errors.js';

export const API_KEY_PREFIX = 'cf_';
const MAX_ACTIVE_KEYS = 20;
const LAST_USED_RESOLUTION_MS = 60_000;

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function toView(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export async function createApiKey(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<CreatedApiKey> {
  const active = await prisma.apiKey.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) {
    throw new AppError(409, 'API_KEY_LIMIT', `You can have at most ${MAX_ACTIVE_KEYS} active API keys`);
  }

  const key = generateApiKey();
  const row = await prisma.apiKey.create({
    data: { userId, name, keyPrefix: key.slice(0, 10), keyHash: hashApiKey(key) },
  });
  return { ...toView(row), key };
}

export async function listApiKeys(prisma: PrismaClient, userId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toView);
}

export async function revokeApiKey(prisma: PrismaClient, userId: string, id: string): Promise<void> {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    const existing = await prisma.apiKey.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError('API key not found');
  }
}

export async function authenticateApiKey(prisma: PrismaClient, key: string): Promise<string | null> {
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  return row.userId;
}