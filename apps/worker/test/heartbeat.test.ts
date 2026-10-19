import {
  WORKER_STALE_AFTER_MS,
  computeWorkerStatus,
  createRedisClient,
  listWorkers,
  startHeartbeat,
  workerKey,
} from '@cloudflow/queue';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitFor } from './helpers.js';

const redisUrl = process.env.REDIS_URL as string;
let redis: ReturnType<typeof createRedisClient>;

beforeAll(() => {
  redis = createRedisClient(redisUrl);
});

afterAll(() => {
  redis.disconnect();
});

describe('computeWorkerStatus', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('is online when the heartbeat is fresh and nothing is running', () => {
    expect(computeWorkerStatus({ lastHeartbeat: ago(1000), stopped: false, processing: 0 }, now)).toBe('online');
  });

  it('is busy when jobs are being processed', () => {
    expect(computeWorkerStatus({ lastHeartbeat: ago(1000), stopped: false, processing: 3 }, now)).toBe('busy');
  });

  it('turns offline once the heartbeat is stale, even if it was busy', () => {
    const stale = ago(WORKER_STALE_AFTER_MS + 1);
    expect(computeWorkerStatus({ lastHeartbeat: stale, stopped: false, processing: 3 }, now)).toBe('offline');
  });

  it('is offline after a clean shutdown', () => {
    expect(computeWorkerStatus({ lastHeartbeat: ago(10), stopped: true, processing: 0 }, now)).toBe('offline');
  });
});

describe('heartbeat', () => {
  it('publishes live stats and ends as a stopped, offline worker', async () => {
    const workerId = `test-${randomUUID()}`;
    const stats = { processing: 0, jobsHandled: 0, jobErrors: 0 };
    const errors: unknown[] = [];
    const heartbeat = startHeartbeat({
      redisUrl,
      identity: { workerId, hostname: 'test-host', pid: 1234, concurrency: 5 },
      getStats: () => stats,
      intervalMs: 50,
      onError: (err) => errors.push(err),
    });
    const find = async () => (await listWorkers(redis)).find((worker) => worker.workerId === workerId) ?? null;

    const online = await waitFor(async () => {
      const worker = await find();
      return worker?.status === 'online' ? worker : null;
    });
    expect(online.concurrency).toBe(5);
    expect(online.hostname).toBe('test-host');

    stats.processing = 2;
    stats.jobsHandled = 7;
    const busy = await waitFor(async () => {
      const worker = await find();
      return worker?.status === 'busy' ? worker : null;
    });
    expect(busy.processing).toBe(2);
    expect(busy.jobsHandled).toBe(7);

    await heartbeat.stop();
    const stopped = await find();
    expect(stopped?.stopped).toBe(true);
    expect(stopped?.status).toBe('offline');
    expect(errors).toEqual([]);

    await redis.del(workerKey(workerId));
  });

  it('ignores corrupt records instead of failing the whole listing', async () => {
    const key = workerKey(`garbage-${randomUUID()}`);
    await redis.set(key, 'this is not json', 'EX', 60);
    const workers = await listWorkers(redis);
    expect(workers.every((worker) => worker.workerId.startsWith('garbage-') === false)).toBe(true);
    await redis.del(key);
  });
});