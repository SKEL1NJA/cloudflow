import type { Redis } from 'ioredis';
import { createRedisClient } from './redis.js';

const KEY_PREFIX = 'cloudflow:worker:';
const RETENTION_SECONDS = 60 * 60;
export const WORKER_STALE_AFTER_MS = 15_000;

export interface WorkerIdentity {
  workerId: string;
  hostname: string;
  pid: number;
  concurrency: number;
}

export interface WorkerStats {
  processing: number;
  completed: number;
  failed: number;
}

export interface WorkerHeartbeat extends WorkerIdentity, WorkerStats {
  startedAt: string;
  lastHeartbeat: string;
  stopped: boolean;
}

export type WorkerStatus = 'online' | 'busy' | 'offline';

export interface WorkerInfo extends WorkerHeartbeat {
  status: WorkerStatus;
  uptimeSeconds: number;
}

export function workerKey(workerId: string): string {
  return `${KEY_PREFIX}${workerId}`;
}

export function computeWorkerStatus(
  heartbeat: Pick<WorkerHeartbeat, 'lastHeartbeat' | 'stopped' | 'processing'>,
  nowMs: number,
  staleAfterMs = WORKER_STALE_AFTER_MS,
): WorkerStatus {
  if (heartbeat.stopped) return 'offline';
  if (nowMs - Date.parse(heartbeat.lastHeartbeat) > staleAfterMs) return 'offline';
  return heartbeat.processing > 0 ? 'busy' : 'online';
}

function isHeartbeat(value: unknown): value is WorkerHeartbeat {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.workerId === 'string' &&
    typeof record.hostname === 'string' &&
    typeof record.pid === 'number' &&
    typeof record.concurrency === 'number' &&
    typeof record.startedAt === 'string' &&
    typeof record.lastHeartbeat === 'string' &&
    typeof record.stopped === 'boolean' &&
    typeof record.processing === 'number' &&
    typeof record.completed === 'number' &&
    typeof record.failed === 'number'
  );
}

function parseHeartbeat(raw: string | null): WorkerHeartbeat | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isHeartbeat(value) ? value : null;
  } catch {
    return null;
  }
}

export async function listWorkers(redis: Redis, nowMs = Date.now()): Promise<WorkerInfo[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  if (keys.length === 0) return [];

  const values = await redis.mget(keys);
  const workers: WorkerInfo[] = [];
  for (const raw of values) {
    const heartbeat = parseHeartbeat(raw);
    if (!heartbeat) continue;
    const status = computeWorkerStatus(heartbeat, nowMs);
    const endMs =
      status === 'offline' ? Math.min(nowMs, Date.parse(heartbeat.lastHeartbeat)) : nowMs;
    workers.push({
      ...heartbeat,
      status,
      uptimeSeconds: Math.max(0, Math.round((endMs - Date.parse(heartbeat.startedAt)) / 1000)),
    });
  }
  return workers.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export interface HeartbeatOptions {
  redisUrl: string;
  identity: WorkerIdentity;
  getStats: () => WorkerStats;
  intervalMs: number;
  onError: (err: unknown) => void;
}

export interface Heartbeat {
  stop: () => Promise<void>;
}

export function startHeartbeat(options: HeartbeatOptions): Heartbeat {
  const { identity, getStats, intervalMs, onError } = options;
  const redis = createRedisClient(options.redisUrl);
  redis.on('error', onError);

  const key = workerKey(identity.workerId);
  const startedAt = new Date().toISOString();

  async function beat(stopped: boolean): Promise<void> {
    const heartbeat: WorkerHeartbeat = {
      ...identity,
      ...getStats(),
      startedAt,
      lastHeartbeat: new Date().toISOString(),
      stopped,
    };
    await redis.set(key, JSON.stringify(heartbeat), 'EX', RETENTION_SECONDS);
  }

  void beat(false).catch(onError);
  const timer = setInterval(() => void beat(false).catch(onError), intervalMs);

  return {
    async stop() {
      clearInterval(timer);
      try {
        await beat(true);
      } catch (err) {
        onError(err);
      } finally {
        redis.disconnect();
      }
    },
  };
}
