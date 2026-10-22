import { streamEventSchema, type StreamEvent } from '@cloudflow/shared';
import { Redis } from 'ioredis';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseRedisUrl } from './redis.js';

export const EVENT_STREAM_KEY = 'cloudflow:events';

const MAX_STREAM_LENGTH = 10_000;
const READ_BLOCK_MS = 5000;
const RETRY_DELAY_MS = 1000;
const START_TIMEOUT_MS = 2000;

export interface StreamEntry {
  id: string;
  event: StreamEvent;
}

export interface EventPublisher {
  publish: (event: StreamEvent) => Promise<void>;
}

export function createEventPublisher(
  redis: Redis,
  onError: (err: unknown) => void,
): EventPublisher {
  return {
    async publish(event) {
      try {
        await redis.xadd(
          EVENT_STREAM_KEY,
          'MAXLEN',
          '~',
          MAX_STREAM_LENGTH,
          '*',
          'data',
          JSON.stringify(event),
        );
      } catch (err) {
        onError(err);
      }
    },
  };
}

function parseEntry(id: string, fields: string[]): StreamEntry | null {
  const index = fields.indexOf('data');
  const raw = index === -1 ? undefined : fields[index + 1];
  if (raw === undefined) return null;
  try {
    const parsed = streamEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { id, event: parsed.data } : null;
  } catch {
    return null;
  }
}

export async function readEventsAfter(
  redis: Redis,
  afterId: string,
  count: number,
): Promise<StreamEntry[]> {
  const rows = await redis.xrange(EVENT_STREAM_KEY, `(${afterId}`, '+', 'COUNT', count);
  return rows.flatMap(([id, fields]) => {
    const entry = parseEntry(id, fields);
    return entry ? [entry] : [];
  });
}

export interface EventReaderOptions {
  redisUrl: string;
  onEntry: (entry: StreamEntry) => void;
  onError: (err: unknown) => void;
}

export interface EventReader {
  stop: () => Promise<void>;
}

export async function startEventReader(options: EventReaderOptions): Promise<EventReader> {
  const redis = new Redis({ ...parseRedisUrl(options.redisUrl), maxRetriesPerRequest: null });
  redis.on('error', options.onError);

  let stopped = false;
  let lastId: string | undefined;

  async function resolveStart(): Promise<void> {
    const latest = await redis.xrevrange(EVENT_STREAM_KEY, '+', '-', 'COUNT', 1);
    lastId = latest[0]?.[0] ?? '0-0';
  }

  try {
    await Promise.race([resolveStart(), sleep(START_TIMEOUT_MS)]);
  } catch (err) {
    options.onError(err);
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      try {
        if (lastId === undefined) await resolveStart();
        const result = await redis.xread(
          'COUNT',
          100,
          'BLOCK',
          READ_BLOCK_MS,
          'STREAMS',
          EVENT_STREAM_KEY,
          lastId ?? '0-0',
        );
        for (const [, entries] of result ?? []) {
          for (const [id, fields] of entries) {
            lastId = id;
            const entry = parseEntry(id, fields);
            if (entry) options.onEntry(entry);
          }
        }
      } catch (err) {
        if (stopped) return;
        options.onError(err);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  const running = loop();

  return {
    async stop() {
      stopped = true;
      redis.disconnect();
      await running;
    },
  };
}