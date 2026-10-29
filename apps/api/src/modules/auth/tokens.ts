import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'cloudflow-api';

export async function signAccessToken(userId: string, sessionId?: string): Promise<string> {
  return new SignJWT(sessionId ? { sid: sessionId } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionId: string | null }> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (!payload.sub) {
    throw new Error('token has no subject');
  }
  return {
    userId: payload.sub,
    sessionId: typeof payload.sid === 'string' ? payload.sid : null,
  };
}
