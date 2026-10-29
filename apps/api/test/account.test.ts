import type { ChangePasswordResponse, SessionListResponse } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader } from './helpers.js';

type Response = Awaited<ReturnType<FastifyInstance['inject']>>;

interface Device {
  accessToken: string;
  cookie: string;
}

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-brand-new-password';
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.prisma.user.deleteMany();
});

function cookieOf(res: Response): string {
  const header = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? header : header ? [header] : [];
  const line = lines.find((entry) => entry.startsWith('cf_refresh='));
  if (!line) throw new Error('response had no refresh cookie');
  return decodeURIComponent((line.split(';')[0] ?? '').slice('cf_refresh='.length));
}

async function authenticate(
  path: '/auth/register' | '/auth/login',
  userAgent: string,
  ip: string,
  email = 'uday@example.com',
  password = PASSWORD,
): Promise<Device> {
  const res = await app.inject({
    method: 'POST',
    url: path,
    headers: { 'user-agent': userAgent },
    remoteAddress: ip,
    payload: { email, password },
  });
  expect(res.statusCode).toBe(path === '/auth/register' ? 201 : 200);
  return { accessToken: res.json<{ accessToken: string }>().accessToken, cookie: cookieOf(res) };
}

function refresh(device: Device, ip = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url: '/auth/refresh',
    headers: { cookie: `cf_refresh=${device.cookie}`, 'user-agent': CHROME },
    remoteAddress: ip,
  });
}

async function sessionsOf(device: Device) {
  const res = await app.inject({
    method: 'GET',
    url: '/auth/sessions',
    headers: authHeader(device.accessToken),
  });
  expect(res.statusCode).toBe(200);
  return res.json<SessionListResponse>().data;
}

function changePassword(device: Device, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/auth/change-password',
    headers: authHeader(device.accessToken),
    payload,
  });
}

describe('PATCH /auth/me', () => {
  it('updates and clears the name', async () => {
    const device = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const patch = (name: string) =>
      app.inject({
        method: 'PATCH',
        url: '/auth/me',
        headers: authHeader(device.accessToken),
        payload: { name },
      });

    expect(
      (await patch('  Uday Khanna ')).json<{ user: { name: string | null } }>().user.name,
    ).toBe('Uday Khanna');
    expect((await patch('')).json<{ user: { name: string | null } }>().user.name).toBeNull();
  });

  it('rejects an overly long name', async () => {
    const device = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: authHeader(device.accessToken),
      payload: { name: 'x'.repeat(101) },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('sessions', () => {
  it('lists every signed-in device with its details and marks the current one', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const mac = await authenticate('/auth/login', FIREFOX, '10.0.0.2');

    const fromLaptop = await sessionsOf(laptop);
    expect(fromLaptop).toHaveLength(2);
    expect(fromLaptop[0]).toMatchObject({ ipAddress: '10.0.0.2', current: false });
    expect(fromLaptop[0]?.userAgent).toContain('Firefox');
    expect(fromLaptop[1]).toMatchObject({ ipAddress: '10.0.0.1', current: true });
    expect(fromLaptop[1]?.userAgent).toContain('Chrome');

    expect((await sessionsOf(mac)).map((session) => session.current)).toEqual([true, false]);
  });

  it('updates where and when a session was last used, without changing when it started', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const [before] = await sessionsOf(laptop);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const res = await refresh(laptop, '10.0.0.9');
    expect(res.statusCode).toBe(200);
    const rotated = {
      accessToken: res.json<{ accessToken: string }>().accessToken,
      cookie: cookieOf(res),
    };

    const after = await sessionsOf(rotated);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before?.id, ipAddress: '10.0.0.9', current: true });
    expect(after[0]?.signedInAt).toBe(before?.signedInAt);
    expect(Date.parse(after[0]?.lastActiveAt ?? '')).toBeGreaterThan(
      Date.parse(before?.lastActiveAt ?? ''),
    );
  });

  it('signs out another device without touching this one', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const mac = await authenticate('/auth/login', FIREFOX, '10.0.0.2');
    const target = (await sessionsOf(laptop)).find((session) => !session.current);

    const revoke = () =>
      app.inject({
        method: 'DELETE',
        url: `/auth/sessions/${target?.id}`,
        headers: authHeader(laptop.accessToken),
      });
    expect((await revoke()).statusCode).toBe(204);
    expect((await revoke()).statusCode).toBe(204);

    expect(await sessionsOf(laptop)).toHaveLength(1);
    expect((await refresh(mac)).statusCode).toBe(401);
    expect((await refresh(laptop)).statusCode).toBe(200);
  });

  it('does not reveal or revoke sessions of other users, or unknown ones', async () => {
    const mine = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const theirs = await authenticate('/auth/register', FIREFOX, '10.0.0.2', 'other@example.com');
    const theirSession = (await sessionsOf(theirs))[0];

    const foreign = await app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${theirSession?.id}`,
      headers: authHeader(mine.accessToken),
    });
    const unknown = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/01a14cec-f85d-7079-b268-9c29038eb32d',
      headers: authHeader(mine.accessToken),
    });
    expect([foreign.statusCode, unknown.statusCode]).toEqual([404, 404]);
    expect((await refresh(theirs)).statusCode).toBe(200);
    expect(await sessionsOf(mine)).toHaveLength(1);
  });

  it('only lists sessions that can still be used', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const mac = await authenticate('/auth/login', FIREFOX, '10.0.0.2');
    const stale = (await sessionsOf(laptop)).find((session) => !session.current);
    const past = new Date(Date.now() - 60_000);
    await app.prisma.refreshToken.updateMany({
      where: { familyId: stale?.id },
      data: { expiresAt: past, sessionExpiresAt: past },
    });

    expect(await sessionsOf(laptop)).toHaveLength(1);
    expect(mac.cookie).toBeDefined();
  });

  it('requires a signed-in session and is not available to API keys', async () => {
    const device = await authenticate('/auth/register', CHROME, '10.0.0.1');
    expect((await app.inject({ method: 'GET', url: '/auth/sessions' })).statusCode).toBe(401);

    const created = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: authHeader(device.accessToken),
      payload: { name: 'ci' },
    });
    const key = created.json<{ key: string }>().key;
    const res = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: authHeader(key),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and signs out every other device but not this one', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const mac = await authenticate('/auth/login', FIREFOX, '10.0.0.2');

    const res = await changePassword(laptop, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ChangePasswordResponse>()).toEqual({ revokedSessions: 1 });

    expect((await refresh(mac)).statusCode).toBe(401);
    expect((await refresh(laptop)).statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'uday@example.com', password: PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);
    await authenticate('/auth/login', CHROME, '10.0.0.3', 'uday@example.com', NEW_PASSWORD);

    const stored = await app.prisma.user.findUniqueOrThrow({
      where: { email: 'uday@example.com' },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('refuses a wrong current password without changing anything', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const res = await changePassword(laptop, {
      currentPassword: 'wrong-password-1',
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_CURRENT_PASSWORD');
    await authenticate('/auth/login', CHROME, '10.0.0.3');
  });

  it.each([
    ['the same password', { currentPassword: PASSWORD, newPassword: PASSWORD }],
    ['a short password', { currentPassword: PASSWORD, newPassword: 'short' }],
    ['a missing current password', { currentPassword: '', newPassword: NEW_PASSWORD }],
  ])('rejects %s', async (_label, payload) => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const res = await changePassword(laptop, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('is not available to API keys', async () => {
    const laptop = await authenticate('/auth/register', CHROME, '10.0.0.1');
    const created = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: authHeader(laptop.accessToken),
      payload: { name: 'ci' },
    });
    const key = created.json<{ key: string }>().key;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: authHeader(key),
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
  });
});
