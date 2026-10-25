import type { RateLimitRule } from './rate-limiter.js';

export const RULES = {
  global: { name: 'global', max: 300, windowSeconds: 60 },
  register: { name: 'register', max: 5, windowSeconds: 3600 },
  login: { name: 'login', max: 60, windowSeconds: 900 },
  refresh: { name: 'refresh', max: 120, windowSeconds: 900 },
  loginFailuresByIpAndEmail: { name: 'login-fail-ip-email', max: 5, windowSeconds: 900 },
  loginFailuresByIp: { name: 'login-fail-ip', max: 30, windowSeconds: 900 },
  invalidApiKeys: { name: 'api-key-fail', max: 30, windowSeconds: 900 },
  runWorkflow: { name: 'run-workflow', max: 60, windowSeconds: 60 },
  createApiKey: { name: 'create-api-key', max: 10, windowSeconds: 3600 },
  eventTicket: { name: 'event-ticket', max: 10, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
