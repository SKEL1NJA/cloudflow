import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../../lib/crypto.js';

const TICKET_PREFIX = 'cloudflow:sse-ticket:';

export const TICKET_TTL_SECONDS = 30;

export async function issueTicket(redis: Redis, userId: string): Promise<string> {
  const ticket = randomBytes(32).toString('base64url');
  await redis.set(`${TICKET_PREFIX}${sha256Hex(ticket)}`, userId, 'EX', TICKET_TTL_SECONDS);
  return ticket;
}

export function redeemTicket(redis: Redis, ticket: string): Promise<string | null> {
  return redis.getdel(`${TICKET_PREFIX}${sha256Hex(ticket)}`);
}
