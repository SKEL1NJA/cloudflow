import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashRefreshToken } from '../src/modules/auth/sessions.js';
import { authHeader } from './helpers.js';

type Response = Awaited<ReturnType<FastifyInstance['inject']>>;

interface AuthBody {
  user: { id: string; email: string };
  accessToken: string;
}

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

function refreshCookie(res: Response): { value: string; attributes: string } | undefined {
  const header = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? header : header ? [header] : [];
  const line = lines.find((entry) => entry.startsWith('cf_refresh='));
  if (!line) return undefined;
  const [pair = '', ...attributes] = line.split(';');
  return {
    value: decodeURIComponent(pair.slice('cf_refresh='.length)),
    attributes: attributes.join(';').toLowerCase(),
  };
}

async function authenticate(path: '/auth/register' | '/auth/login', email = 'uday@example.com') {
  const res = await app.inject({
    method: 'POST',
    url: path,
    payload: { email, password: 'correct-horse-battery' },
  });
  const cookie = refreshCookie(res);
  if (!cookie) throw new Error('response had no refresh cookie');
  return { res, cookie, body: res.json<AuthBody>() };
}

const signUp = (email?: string) => authenticate('/auth/register', email);
const signIn = (email?: string) => authenticate('/auth/login', email);

function refresh(token: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/auth/refresh',
    headers: { cookie: `cf_refresh=${token}`, ...headers },
  });
}

const rowFor = (token: string) =>
  app.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(token) } });

describe('issuing sessions', () => {
  it('sets a locked-down httpOnly cookie and keeps the token out of the body', async () => {
    const { res, cookie } = await signUp();
    expect(cookie.attributes).toContain('httponly');
    expect(cookie.attributes).toContain('samesite=strict');
    expect(cookie.attributes).toContain('path=/auth');
    expect(cookie.attributes).toContain('max-age=');
    expect(res.body).not.toContain(cookie.value);
  });

  it('stores only a hash of the token', async () => {
    const { cookie } = await signUp();
    const row = await rowFor(cookie.value);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(cookie.value);
  });

  it('starts a new family on every login', async () => {
    const first = await signUp();
    const second = await signIn();
    expect((await rowFor(first.cookie.value)).familyId).not.toBe((await rowFor(second.cookie.value)).familyId);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the token, keeps the family and returns a working access token', async () => {
    const { cookie, body } = await signUp();
    const res = await refresh(cookie.value);
    expect(res.statusCode).toBe(200);

    const next = refreshCookie(res);
    expect(next?.value).toBeDefined();
    expect(next?.value).not.toBe(cookie.value);

    const oldRow = await rowFor(cookie.value);
    const newRow = await rowFor(next?.value ?? '');
    expect(oldRow.usedAt).not.toBeNull();
    expect(newRow.familyId).toBe(oldRow.familyId);
    expect(newRow.sessionExpiresAt).toEqual(oldRow.sessionExpiresAt);

    const accessToken = res.json<AuthBody>().accessToken;
    expect(res.json<AuthBody>().user.id).toBe(body.user.id);
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: authHeader(accessToken) });
    expect(me.statusCode).toBe(200);
  });

  it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
    const { cookie } = await signUp();
    const rotated = refreshCookie(await refresh(cookie.value));

    expect((await refresh(cookie.value)).statusCode).toBe(401);
    expect((await refresh(rotated?.value ?? '')).statusCode).toBe(401);
    expect((await rowFor(rotated?.value ?? '')).revokedAt).not.toBeNull();
  });

  it('lets only one of two simultaneous refreshes win and then revokes the family', async () => {
    const { cookie } = await signUp();
    const [a, b] = await Promise.all([refresh(cookie.value), refresh(cookie.value)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401]);

    const winner = refreshCookie(a.statusCode === 200 ? a : b);
    expect((await refresh(winner?.value ?? '')).statusCode).toBe(401);
  });

  it('rejects a missing or unknown token and clears the cookie', async () => {
    const missing = await app.inject({ method: 'POST', url: '/auth/refresh' });
    expect(missing.statusCode).toBe(401);

    const unknown = await refresh('not-a-real-token');
    expect(unknown.statusCode).toBe(401);
    const cleared = refreshCookie(unknown);
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes).toContain('1970');
  });

  it('rejects an expired token', async () => {
    const { cookie } = await signUp();
    await app.prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(cookie.value) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(cookie.value)).statusCode).toBe(401);
  });

  it('never lets a rotated token outlive the absolute session limit', async () => {
    const { cookie } = await signUp();
    const soon = new Date(Date.now() + 3_600_000);
    await app.prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(cookie.value) },
      data: { sessionExpiresAt: soon, expiresAt: soon },
    });

    const res = await refresh(cookie.value);
    const next = await rowFor(refreshCookie(res)?.value ?? '');
    expect(next.expiresAt.getTime()).toBeLessThanOrEqual(soon.getTime());

    await app.prisma.refreshToken.update({ where: { id: next.id }, data: { sessionExpiresAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(refreshCookie(res)?.value ?? '')).statusCode).toBe(401);
  });

  it('refuses requests from untrusted origins without consuming the token', async () => {
    const { cookie } = await signUp();
    const evil = await refresh(cookie.value, { origin: 'https://evil.example' });
    expect(evil.statusCode).toBe(403);
    expect((await rowFor(cookie.value)).usedAt).toBeNull();

    const trusted = await refresh(cookie.value, { origin: 'http://localhost:5173' });
    expect(trusted.statusCode).toBe(200);
  });
});

describe('logging out', () => {
  it('revokes the session and is safe to repeat', async () => {
    const { cookie } = await signUp();
    const headers = { cookie: `cf_refresh=${cookie.value}` };

    const first = await app.inject({ method: 'POST', url: '/auth/logout', headers });
    expect(first.statusCode).toBe(204);
    expect(refreshCookie(first)?.value).toBe('');
    expect((await refresh(cookie.value)).statusCode).toBe(401);

    const again = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(again.statusCode).toBe(204);
  });

  it('ends every session of the account with logout-all', async () => {
    const first = await signUp();
    const second = await signIn();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: authHeader(second.body.accessToken),
    });
    expect(res.statusCode).toBe(204);
    expect((await refresh(first.cookie.value)).statusCode).toBe(401);
    expect((await refresh(second.cookie.value)).statusCode).toBe(401);
  });

  it('refuses logout-all without a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout-all' });
    expect(res.statusCode).toBe(401);
  });
});