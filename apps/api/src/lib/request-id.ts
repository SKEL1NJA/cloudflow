import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function safeRequestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && VALID_REQUEST_ID.test(header) ? header : randomUUID();
}