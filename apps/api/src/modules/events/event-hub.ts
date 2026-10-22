import type { StreamEntry } from '@cloudflow/queue';
import { toClientEvent } from '@cloudflow/shared';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3000;
const MAX_REPLAY_AGE_MS = 10 * 60_000;
const REPLAY_LIMIT = 500;
const MAX_PENDING = 1000;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const STREAM_ID = /^(\d{1,16})-(\d{1,10})$/;

export const MAX_STREAMS_PER_USER = 10;

const RESYNC_FRAME = 'event: resync\ndata: {}\n\n';
const SHUTDOWN_FRAME = 'event: shutdown\ndata: {}\n\n';

export function compareStreamIds(a: string, b: string): number {
  const [aMs = '0', aSeq = '0'] = a.split('-');
  const [bMs = '0', bSeq = '0'] = b.split('-');
  const ms = BigInt(aMs) - BigInt(bMs);
  if (ms !== 0n) return ms > 0n ? 1 : -1;
  const seq = BigInt(aSeq) - BigInt(bSeq);
  return seq === 0n ? 0 : seq > 0n ? 1 : -1;
}

function toFrame(entry: StreamEntry): string {
  const event = toClientEvent(entry.event);
  return `id: ${entry.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

interface Client {
  id: string;
  userId: string;
  raw: ServerResponse;
  ready: boolean;
  resync: boolean;
  pending: StreamEntry[];
  sentUpTo: string;
}

export interface EventHubOptions {
  readAfter: (afterId: string, count: number) => Promise<StreamEntry[]>;
  onError: (err: unknown, message: string) => void;
}

export class EventHub {
  private readonly byUser = new Map<string, Set<Client>>();
  private count = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: EventHubOptions) {}

  get size(): number {
    return this.count;
  }

  start(): void {
    this.timer = setInterval(() => this.broadcast(': ping\n\n'), HEARTBEAT_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  canAccept(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) < MAX_STREAMS_PER_USER;
  }

  async attach(userId: string, raw: ServerResponse, lastEventId?: string): Promise<void> {
    const client: Client = {
      id: randomUUID(),
      userId,
      raw,
      ready: false,
      resync: false,
      pending: [],
      sentUpTo: '0-0',
    };
    this.add(client);
    raw.on('close', () => this.remove(client));
    raw.on('error', () => this.remove(client));
    this.write(client, `retry: ${RETRY_MS}\n\n: connected\n\n`);

    try {
      await this.catchUp(client, lastEventId);
    } catch (err) {
      this.options.onError(err, 'could not replay missed events');
      client.resync = true;
    }
    this.goLive(client);
  }

  dispatch(entry: StreamEntry): void {
    const clients = this.byUser.get(entry.event.userId);
    if (!clients) return;
    for (const client of [...clients]) {
      if (client.ready) {
        this.write(client, toFrame(entry));
      } else if (client.pending.length < MAX_PENDING) {
        client.pending.push(entry);
      } else {
        client.resync = true;
      }
    }
  }

  closeAll(): void {
    for (const clients of [...this.byUser.values()]) {
      for (const client of [...clients]) {
        this.write(client, SHUTDOWN_FRAME);
        this.remove(client);
      }
    }
  }

  private async catchUp(client: Client, lastEventId: string | undefined): Promise<void> {
    if (lastEventId === undefined) return;

    const match = STREAM_ID.exec(lastEventId);
    if (!match || Date.now() - Number(match[1]) > MAX_REPLAY_AGE_MS) {
      client.resync = true;
      return;
    }

    client.sentUpTo = lastEventId;
    const entries = await this.options.readAfter(lastEventId, REPLAY_LIMIT + 1);
    if (entries.length > REPLAY_LIMIT) {
      client.resync = true;
      return;
    }
    for (const entry of entries) {
      client.sentUpTo = entry.id;
      if (entry.event.userId === client.userId) this.write(client, toFrame(entry));
    }
  }

  private goLive(client: Client): void {
    if (client.raw.destroyed || client.raw.writableEnded) return;

    if (client.resync) {
      this.write(client, RESYNC_FRAME);
    } else {
      for (const entry of client.pending) {
        if (compareStreamIds(entry.id, client.sentUpTo) > 0) this.write(client, toFrame(entry));
      }
    }
    client.pending = [];
    client.ready = true;
  }

  private broadcast(chunk: string): void {
    for (const clients of this.byUser.values()) {
      for (const client of clients) this.write(client, chunk);
    }
  }

  private add(client: Client): void {
    const clients = this.byUser.get(client.userId) ?? new Set<Client>();
    clients.add(client);
    this.byUser.set(client.userId, clients);
    this.count += 1;
  }

  private remove(client: Client): void {
    const clients = this.byUser.get(client.userId);
    if (!clients?.delete(client)) return;
    if (clients.size === 0) this.byUser.delete(client.userId);
    this.count -= 1;
    if (!client.raw.writableEnded) client.raw.end();
  }

  private write(client: Client, chunk: string): void {
    const { raw } = client;
    if (raw.destroyed || raw.writableEnded) return;
    if (raw.writableLength > MAX_BUFFERED_BYTES) {
      this.remove(client);
      raw.destroy();
      return;
    }
    raw.write(chunk);
  }
}