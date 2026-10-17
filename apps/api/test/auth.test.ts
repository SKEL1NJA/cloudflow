import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

interface AuthResponse {
  user: { id: string; email: string; name: string | null };
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

async function register(email = 'uday@example.com', password = 'correct-horse-battery') {
  return app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password, name: 'Uday' },
  });
}

describe('POST /auth/register', () => {
  it('creates a user and returns a token without exposing the password hash', async () => {
    const res = await register();
    expect(res.statusCode).toBe(201);

    const body = res.json<AuthResponse>();
    expect(body.user.email).toBe('uday@example.com');
    expect(body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toContain('passwordHash');
    expect(res.body).not.toContain('correct-horse-battery');
  });

  it('stores an Argon2id hash, never the plaintext password', async () => {
    await register();
    const stored = await app.prisma.user.findUniqueOrThrow({ where: { email: 'uday@example.com' } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain('correct-horse-battery');
  });

  it('rejects a duplicate email regardless of letter case', async () => {
    await register('uday@example.com');
    const res = await register('UDAY@Example.com');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CONFLICT');
  });

  it('rejects invalid input with a validation error', async () => {
    const res = await register('not-an-email', 'short');
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('returns a token for correct credentials', async () => {
    await register();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'uday@example.com', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AuthResponse>().accessToken).toEqual(expect.any(String));
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await register();
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'uday@example.com', password: 'wrong-password-123' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong-password-123' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });
});

describe('GET /auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { accessToken } = (await register()).json<AuthResponse>();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ user: { email: string } }>().user.email).toBe('uday@example.com');
  });

  it('rejects a missing token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const { user } = (await register()).json<AuthResponse>();
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('cloudflow-api')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('some-other-secret-that-is-also-32-chars-long'));
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { user } = (await register()).json<AuthResponse>();
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('cloudflow-api')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode('test-only-secret-that-is-at-least-32-characters-long'));
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });
});