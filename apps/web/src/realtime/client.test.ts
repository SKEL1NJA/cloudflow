import type { RealtimeEvent } from '@cloudflow/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRealtimeClient,
  reconnectDelayMs,
  type EventSourceLike,
  type RealtimeClient,
} from './client';

class FakeSource implements EventSourceLike {
  static instances: FakeSource[] = [];
  closed = false;
  private readonly handlers = new Map<string, ((event: Event) => void)[]>();

  constructor(readonly url: string) {
    FakeSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string, id = ''): void {
    const event =
      data === undefined ? new Event(type) : new MessageEvent(type, { data, lastEventId: id });

    for (const handler of this.handlers.get(type) ?? []) {
      handler(event);
    }
  }
}

const executionEvent: RealtimeEvent = {
  type: 'execution.updated',
  workflowId: '01a14cec-f85d-7079-b268-9c29038eb32d',
  executionId: '01a14cec-f85d-7079-b268-9c29038eb32e',
  status: 'RUNNING',
  at: '2026-10-20T10:00:00.000Z',
};

function current(): FakeSource {
  const source = FakeSource.instances.at(-1);

  if (!source) {
    throw new Error('no stream was opened');
  }

  return source;
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(0);
}

const clients: RealtimeClient[] = [];

function setup(getTicket?: () => Promise<{ ticket: string; expiresInSeconds: number }>) {
  const events: RealtimeEvent[] = [];
  const onResync = vi.fn();
  let tickets = 0;

  const client = createRealtimeClient({
    onEvent: (event) => events.push(event),
    onResync,
    getTicket:
      getTicket ??
      (async () => ({
        ticket: `ticket-${++tickets}`,
        expiresInSeconds: 30,
      })),
    createSource: (url) => new FakeSource(url),
    random: () => 1,
  });

  clients.push(client);
  return { client, events, onResync };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.instances = [];
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.stop();
  }

  vi.useRealTimers();
});

describe('reconnectDelayMs', () => {
  it('doubles up to a cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((attempt) => reconnectDelayMs(attempt, () => 1))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });

  it('spreads delays between half and the full value', () => {
    expect(reconnectDelayMs(2, () => 0)).toBe(2000);
    expect(reconnectDelayMs(2, () => 1)).toBe(4000);
  });
});

describe('connecting', () => {
  it('asks for a ticket, opens the stream with it and reports when it is live', async () => {
    const { client } = setup();

    client.start();
    expect(client.getStatus()).toBe('connecting');

    await advance(0);

    const url = new URL(current().url);

    expect(url.pathname).toBe('/events');
    expect(url.searchParams.get('ticket')).toBe('ticket-1');
    expect(url.searchParams.has('lastEventId')).toBe(false);

    current().emit('open');

    expect(client.getStatus()).toBe('live');
  });

  it('refreshes data once when a fresh connection opens, to cover the gap since the first fetch', async () => {
    const { client, onResync } = setup();

    client.start();
    await advance(0);
    current().emit('open');

    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('delivers valid events and ignores malformed ones', async () => {
    const { client, events } = setup();

    client.start();
    await advance(0);
    current().emit('open');

    current().emit('execution.updated', JSON.stringify(executionEvent), '1-0');
    current().emit('execution.updated', '{"type":"execution.updated","status":"EXPLODED"}', '2-0');
    current().emit('execution.updated', 'not json', '3-0');

    expect(events).toEqual([executionEvent]);
  });

  it('notifies subscribers about status changes until they unsubscribe', async () => {
    const { client } = setup();
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);

    client.start();
    await advance(0);
    current().emit('open');

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    current().emit('error');

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('reconnecting', () => {
  it('fetches a fresh ticket and resumes from the last event id', async () => {
    const { client, onResync } = setup();

    client.start();
    await advance(0);

    const first = current();

    first.emit('open');
    first.emit('execution.updated', JSON.stringify(executionEvent), '1761000000000-3');

    first.emit('error');

    expect(first.closed).toBe(true);
    expect(client.getStatus()).toBe('reconnecting');

    await advance(1000);

    const second = current();

    expect(second).not.toBe(first);

    const url = new URL(second.url);

    expect(url.searchParams.get('ticket')).toBe('ticket-2');
    expect(url.searchParams.get('lastEventId')).toBe('1761000000000-3');

    second.emit('open');

    expect(client.getStatus()).toBe('live');
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially and starts over after a successful connection', async () => {
    const { client } = setup();

    client.start();
    await advance(0);

    current().emit('error');

    await advance(999);
    expect(FakeSource.instances).toHaveLength(1);

    await advance(1);
    expect(FakeSource.instances).toHaveLength(2);

    current().emit('error');

    await advance(1999);
    expect(FakeSource.instances).toHaveLength(2);

    await advance(1);
    expect(FakeSource.instances).toHaveLength(3);

    current().emit('open');
    current().emit('error');

    await advance(1000);
    expect(FakeSource.instances).toHaveLength(4);
  });

  it('retries when the ticket request fails', async () => {
    let calls = 0;

    const { client } = setup(async () => {
      calls += 1;

      if (calls === 1) {
        throw new Error('network down');
      }

      return { ticket: 'ticket-ok', expiresInSeconds: 30 };
    });

    client.start();
    await advance(0);

    expect(client.getStatus()).toBe('reconnecting');
    expect(FakeSource.instances).toHaveLength(0);

    await advance(1000);

    expect(FakeSource.instances).toHaveLength(1);
  });

  it('reconnects when the server announces a shutdown', async () => {
    const { client } = setup();

    client.start();
    await advance(0);
    current().emit('open');

    current().emit('shutdown');

    expect(client.getStatus()).toBe('reconnecting');

    await advance(1000);

    expect(FakeSource.instances).toHaveLength(2);
  });

  it('asks for a refetch when the server says it could not replay', async () => {
    const { client, onResync } = setup();

    client.start();
    await advance(0);
    current().emit('open');
    current().emit('resync');

    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it('reconnects right away when the browser comes back online', async () => {
    const { client } = setup();

    client.start();
    await advance(0);
    current().emit('error');

    expect(FakeSource.instances).toHaveLength(1);

    window.dispatchEvent(new Event('online'));
    await advance(0);

    expect(FakeSource.instances).toHaveLength(2);
  });
});

describe('silent connections', () => {
  it('stays connected while heartbeats keep arriving and reconnects when they stop', async () => {
    const { client } = setup();

    client.start();
    await advance(0);

    const first = current();

    first.emit('open');

    await advance(60_000);
    first.emit('heartbeat');

    await advance(60_000);

    expect(client.getStatus()).toBe('live');
    expect(first.closed).toBe(false);

    await advance(20_000);

    expect(client.getStatus()).toBe('reconnecting');
    expect(first.closed).toBe(true);
  });
});

describe('stopping', () => {
  it('closes the stream and cancels pending reconnects', async () => {
    const { client } = setup();

    client.start();
    await advance(0);

    const first = current();

    first.emit('open');
    first.emit('error');

    client.stop();

    expect(client.getStatus()).toBe('stopped');

    await advance(60_000);

    expect(FakeSource.instances).toHaveLength(1);
    expect(first.closed).toBe(true);
  });

  it('survives a start, stop, start sequence without opening a stale connection', async () => {
    const { client } = setup();

    client.start();
    client.stop();
    client.start();

    await advance(0);

    expect(FakeSource.instances).toHaveLength(1);
    expect(new URL(current().url).searchParams.get('ticket')).toBe('ticket-2');
  });
});
