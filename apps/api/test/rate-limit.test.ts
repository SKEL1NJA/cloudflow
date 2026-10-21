import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { authHeader } from './helpers.js';

const PASSWORD = 'correct-horse-battery';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ rateLimitEnabled: true });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const keys = await app.redis.keys('cloudflow:rl:*');
  if (keys.length > 0) await app.redis.del(...keys);
  await app.prisma.user.deleteMany();
});

async function createUser(email: string): Promise<void> {
  await app.prisma.user.create({ data: { email, passwordHash: await hashPassword(PASSWORD) } });
}

function login(email: string, password: string, remoteAddress?: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
    ...(remoteAddress && { remoteAddress }),
  });
}

describe('registration limit', () => {
  it('allows five registrations per hour from one address and reports the limit', async () => {
    const statuses: number[] = [];
    let last = await app.inject({ method: 'GET', url: '/health' });
    for (let index = 0; index < 6; index += 1) {
      last = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `user${index}@example.com`, password: PASSWORD },
      });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(last.json<{ error: { code: string } }>().error.code).toBe('RATE_LIMITED');
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('reports the remaining budget in headers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'one@example.com', password: PASSWORD },
    });
    expect(res.headers['ratelimit-limit']).toBe('5');
    expect(res.headers['ratelimit-remaining']).toBe('4');
  });
});

describe('login lockout', () => {
  it('locks an address and email pair after five failures, even for the right password', async () => {
    await createUser('uday@example.com');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login('uday@example.com', 'wrong-password-123')).statusCode).toBe(401);
    }

    const locked = await login('uday@example.com', PASSWORD);
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not lock the owner out from a different address', async () => {
    await createUser('uday@example.com');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login('uday@example.com', 'wrong-password-123');
    }
    expect((await login('uday@example.com', PASSWORD, '10.9.9.9')).statusCode).toBe(200);
  });

  it('treats unknown emails exactly like wrong passwords', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await login('nobody@example.com', 'wrong-password-123')).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('forgets earlier failures after a successful login', async () => {
    await createUser('uday@example.com');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login('uday@example.com', 'wrong-password-123');
    }
    expect((await login('uday@example.com', PASSWORD)).statusCode).toBe(200);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await login('uday@example.com', 'wrong-password-123')).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('limits password spraying across many emails from one address', async () => {
    let blockedAt = -1;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const res = await login(`target${attempt}@example.com`, 'wrong-password-123');
      if (res.statusCode === 429) {
        blockedAt = attempt;
        break;
      }
    }
    expect(blockedAt).toBe(30);
  });
});

describe('API key and per-user limits', () => {
  it('throttles repeated invalid API keys without affecting valid sessions', async () => {
    await createUser('uday@example.com');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const res = await app.inject({
        method: 'GET',
        url: '/workflows',
        headers: authHeader(`cf_invalid${attempt}`),
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 30).every((status) => status === 401)).toBe(true);
    expect(statuses[30]).toBe(429);

    const session = (await login('uday@example.com', PASSWORD)).json<{ accessToken: string }>();
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: authHeader(session.accessToken) });
    expect(me.statusCode).toBe(200);
  });

  it('limits API key creation per user, not per address', async () => {
    await createUser('a@example.com');
    await createUser('b@example.com');
    const tokenA = (await login('a@example.com', PASSWORD)).json<{ accessToken: string }>().accessToken;
    const tokenB = (await login('b@example.com', PASSWORD)).json<{ accessToken: string }>().accessToken;

    const create = (token: string) =>
      app.inject({ method: 'POST', url: '/api-keys', headers: authHeader(token), payload: { name: 'ci' } });

    for (let index = 0; index < 10; index += 1) {
      expect((await create(tokenA)).statusCode).toBe(201);
    }
    expect((await create(tokenA)).statusCode).toBe(429);
    expect((await create(tokenB)).statusCode).toBe(201);
  });
});