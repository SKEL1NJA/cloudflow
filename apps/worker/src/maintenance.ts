import type { PrismaClient } from '@cloudflow/db';
import type { Logger } from 'pino';

const DAY_MS = 86_400_000;

export async function pruneRefreshTokens(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } },
  });
  return count;
}

export interface Maintenance {
  stop: () => Promise<void>;
}

export function startMaintenance(
  prisma: PrismaClient,
  logger: Logger,
  intervalMs: number,
): Maintenance {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  async function pass(): Promise<void> {
    try {
      const pruned = await pruneRefreshTokens(prisma);
      if (pruned > 0) logger.info({ pruned }, 'pruned expired refresh tokens');
    } catch (err) {
      logger.warn({ err }, 'maintenance pass failed');
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = pass().finally(schedule);
    }, intervalMs * (0.8 + Math.random() * 0.4));
  }

  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  };
}