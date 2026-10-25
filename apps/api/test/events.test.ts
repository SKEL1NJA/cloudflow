import { streamEventSchema, toClientEvent, type ExecutionStatus } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MAX_STREAMS_PER_USER, compareStreamIds } from '../src/modules/events/event-hub.js';
import {
  authHeader,
  createWorkflow,
  registerUser,
  registerUserWithId,
  waitFor,
} from './helpers.js';
import { openStream, type SseStream } from './sse.js';

let app: FastifyInstance;
let baseUrl: string;
let token: string;
let userId: string;
let otherUserId: string;
let streams: SseStream[] = [];

beforeAll(async () => {
  app = buildApp();
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.queue.obliterate({ force: true });
  await app.prisma.user.deleteMany();
  ({ token, userId } = await registerUserWithId(app, 'uday@example.com'));
  ({ userId: otherUserId } = await registerUserWithId(app, 'other@example.com'));
});

afterEach(async () => {
  await Promise.all(streams.map((stream) => stream.close()));
  streams = [];
});

async function connect(headers: Record<string, string> = {}, query = ''): Promise<SseStream> {
  const stream = await openStream(`${baseUrl}/events${query}`, {
    ...authHeader(token),
    ...headers,
  });
  streams.push(stream);
  return stream;
}

async function publish(owner: string, status: ExecutionStatus = 'RUNNING'): Promise<string> {
  const executionId = randomUUID();
  await app.events.publish({
    type: 'execution.updated',
    userId: owner,
    workflowId: randomUUID(),
    executionId,
    status,
    at: new Date().toISOString(),
  });
  return executionId;
}

function payload(frame: { data?: string }): Record<string, unknown> {
  return JSON.parse(frame.data ?? '{}') as Record<string, unknown>;
}

describe('stream ids and event shapes', () => {
  it('orders stream ids numerically, not as text', () => {
    expect(compareStreamIds('9-0', '10-0')).toBe(-1);
    expect(compareStreamIds('10-1', '10-0')).toBe(1);
    expect(compareStreamIds('10-0', '10-0')).toBe(0);
  });

  it('rejects malformed events and strips the owner when sending to clients', () => {
    const event = {
      type: 'execution.updated',
      userId: randomUUID(),
      workflowId: randomUUID(),
      executionId: randomUUID(),
      status: 'RUNNING',
      at: new Date().toISOString(),
    };
    expect(streamEventSchema.safeParse({ ...event, status: 'EXPLODED' }).success).toBe(false);
    expect(streamEventSchema.safeParse({ ...event, type: 'unknown' }).success).toBe(false);

    const parsed = streamEventSchema.parse(event);
    expect(toClientEvent(parsed)).not.toHaveProperty('userId');
  });
});

describe('authentication and tickets', () => {
  it('rejects streams without credentials', async () => {
    const stream = await openStream(`${baseUrl}/events`);
    expect(stream.status).toBe(401);
  });

  it('requires a signed-in caller to get a ticket', async () => {
    const res = await app.inject({ method: 'POST', url: '/events/ticket' });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a ticket exactly once and never stores it in plain text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events/ticket',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const { ticket, expiresInSeconds } = res.json<{ ticket: string; expiresInSeconds: number }>();
    expect(expiresInSeconds).toBe(30);

    const keys = await app.redis.keys('cloudflow:sse-ticket:*');
    expect(keys).toHaveLength(1);
    expect(keys.some((key) => key.includes(ticket))).toBe(false);

    const first = await openStream(`${baseUrl}/events?ticket=${ticket}`);
    streams.push(first);
    expect(first.status).toBe(200);
    const executionId = await publish(userId);
    expect(payload(await first.next())).toMatchObject({ executionId });

    const second = await openStream(`${baseUrl}/events?ticket=${ticket}`);
    expect(second.status).toBe(401);
  });

  it('rejects expired and unknown tickets', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events/ticket',
      headers: authHeader(token),
    });
    const { ticket } = res.json<{ ticket: string }>();
    await app.redis.del(...(await app.redis.keys('cloudflow:sse-ticket:*')));

    expect((await openStream(`${baseUrl}/events?ticket=${ticket}`)).status).toBe(401);
    expect((await openStream(`${baseUrl}/events?ticket=${'x'.repeat(43)}`)).status).toBe(401);
  });

  it('lets an API key open a stream', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: authHeader(token),
      payload: { name: 'stream' },
    });
    const { key } = created.json<{ key: string }>();

    const stream = await openStream(`${baseUrl}/events`, authHeader(key));
    streams.push(stream);
    expect(stream.status).toBe(200);
  });
});

describe('delivery', () => {
  it('sends only the caller events, without internal fields, with a resumable id', async () => {
    const stream = await connect();
    await publish(otherUserId);
    const mine = await publish(userId, 'SUCCESS');

    const frame = await stream.next();
    expect(frame.event).toBe('execution.updated');
    expect(frame.id).toMatch(/^\d+-\d+$/);
    expect(payload(frame)).toMatchObject({
      type: 'execution.updated',
      executionId: mine,
      status: 'SUCCESS',
    });
    expect(payload(frame)).not.toHaveProperty('userId');
  });

  it('announces API actions to every open stream of the user', async () => {
    const workflow = await createWorkflow(app, token);
    const first = await connect();
    const second = await connect();

    const run = await app.inject({
      method: 'POST',
      url: `/workflows/${workflow.id}/run`,
      headers: authHeader(token),
    });
    const execution = run.json<{ id: string }>();

    for (const stream of [first, second]) {
      expect(payload(await stream.next())).toMatchObject({
        executionId: execution.id,
        workflowId: workflow.id,
        status: 'QUEUED',
      });
    }

    await app.inject({
      method: 'POST',
      url: `/executions/${execution.id}/cancel`,
      headers: authHeader(token),
    });
    expect(payload(await first.next())).toMatchObject({
      executionId: execution.id,
      status: 'CANCELLED',
    });
  });

  it('does not deliver events to other users', async () => {
    const otherToken = await registerUser(app, 'third@example.com');
    const stream = await openStream(`${baseUrl}/events`, authHeader(otherToken));
    streams.push(stream);

    await publish(userId);
    await expect(stream.next(300)).rejects.toThrow('Timed out');
  });
});

describe('resuming', () => {
  it('replays missed events in order, skips other users, then continues live', async () => {
    const first = await connect();
    await publish(userId);
    const seen = await first.next();
    await first.close();

    const missedA = await publish(userId, 'SUCCESS');
    await publish(otherUserId);
    const missedB = await publish(userId, 'FAILED');

    const resumed = await connect({ 'last-event-id': seen.id ?? '' });
    expect(payload(await resumed.next())).toMatchObject({ executionId: missedA });
    expect(payload(await resumed.next())).toMatchObject({ executionId: missedB });

    const live = await publish(userId, 'CANCELLED');
    expect(payload(await resumed.next())).toMatchObject({ executionId: live });
  });

  it('also accepts the last event id as a query parameter', async () => {
    const first = await connect();
    await publish(userId);
    const seen = await first.next();
    await first.close();
    const missed = await publish(userId, 'SUCCESS');

    const resumed = await connect({}, `?lastEventId=${seen.id}`);
    expect(payload(await resumed.next())).toMatchObject({ executionId: missed });
  });

  it.each(['1-0', 'garbage'])(
    'asks the client to refetch when the last id is %s',
    async (lastId) => {
      const stream = await connect({ 'last-event-id': lastId });
      expect((await stream.next()).event).toBe('resync');

      const live = await publish(userId);
      expect(payload(await stream.next())).toMatchObject({ executionId: live });
    },
  );
});

describe('limits and cleanup', () => {
  it('limits the number of streams per user and frees the slot on disconnect', async () => {
    const opened: SseStream[] = [];
    for (let index = 0; index < MAX_STREAMS_PER_USER; index += 1) opened.push(await connect());

    const rejected = await connect();
    expect(rejected.status).toBe(429);
    expect(JSON.parse(rejected.errorBody)).toMatchObject({ error: { code: 'TOO_MANY_STREAMS' } });

    await opened[0]?.close();
    await waitFor(async () => (app.eventHub.size < MAX_STREAMS_PER_USER ? true : null));
    expect((await connect()).status).toBe(200);
  });

  it('forgets a client as soon as it disconnects', async () => {
    const stream = await connect();
    expect(app.eventHub.size).toBe(1);
    await stream.close();
    await waitFor(async () => (app.eventHub.size === 0 ? true : null));
  });

  it('closes every stream when the server shuts down', async () => {
    const second = buildApp();
    const url = await second.listen({ host: '127.0.0.1', port: 0 });
    const secondToken = await registerUser(second, 'shutdown@example.com');
    const stream = await openStream(`${url}/events`, authHeader(secondToken));
    expect(stream.status).toBe(200);

    const started = Date.now();
    const closing = second.close();
    expect((await stream.next()).event).toBe('shutdown');
    await closing;
    await stream.untilClosed();
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
