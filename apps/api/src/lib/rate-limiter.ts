import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { RateLimitError } from './errors.js';

export interface RateLimitRule {
  name: string;
  max: number;
  windowSeconds: number;
}

export interface WindowState {
  count: number;
  retryAfterSeconds: number;
}

type Enforcer = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface RateLimiter {
  consume: (rule: RateLimitRule, key: string) => Promise<WindowState>;
  peek: (rule: RateLimitRule, key: string) => Promise<WindowState>;
  reset: (rule: RateLimitRule, key: string) => Promise<void>;
  byIp: (rule: RateLimitRule) => Enforcer;
  byUser: (rule: RateLimitRule) => Enforcer;
}

export function createRateLimiter(
  redis: Redis,
  enabled: boolean,
  log: FastifyBaseLogger,
): RateLimiter {
  const keyOf = (rule: RateLimitRule, key: string) => `cloudflow:rl:${rule.name}:${key}`;
  const idle = (rule: RateLimitRule): WindowState => ({ count: 0, retryAfterSeconds: rule.windowSeconds });
  const retryAfter = (rule: RateLimitRule, ttl: number) => (ttl > 0 ? ttl : rule.windowSeconds);

  async function consume(rule: RateLimitRule, key: string): Promise<WindowState> {
    if (!enabled) return idle(rule);
    const redisKey = keyOf(rule, key);
    try {
      const results = await redis
        .multi()
        .set(redisKey, 0, 'EX', rule.windowSeconds, 'NX')
        .incr(redisKey)
        .ttl(redisKey)
        .exec();
      const count = Number(results?.[1]?.[1]);
      const ttl = Number(results?.[2]?.[1]);
      if (!Number.isFinite(count)) throw new Error('unexpected reply from redis');
      return { count, retryAfterSeconds: retryAfter(rule, ttl) };
    } catch (err) {
      log.warn({ err, rule: rule.name }, 'rate limiter unavailable, allowing the request');
      return idle(rule);
    }
  }

  async function peek(rule: RateLimitRule, key: string): Promise<WindowState> {
    if (!enabled) return idle(rule);
    const redisKey = keyOf(rule, key);
    try {
      const [raw, ttl] = await Promise.all([redis.get(redisKey), redis.ttl(redisKey)]);
      return { count: raw === null ? 0 : Number(raw), retryAfterSeconds: retryAfter(rule, ttl) };
    } catch (err) {
      log.warn({ err, rule: rule.name }, 'rate limiter unavailable, allowing the request');
      return idle(rule);
    }
  }

  async function reset(rule: RateLimitRule, key: string): Promise<void> {
    if (!enabled) return;
    try {
      await redis.del(keyOf(rule, key));
    } catch (err) {
      log.warn({ err, rule: rule.name }, 'could not reset rate limit counter');
    }
  }

  function enforce(rule: RateLimitRule, keyFor: (request: FastifyRequest) => string | null): Enforcer {
    return async (request, reply) => {
      if (!enabled) return;
      const key = keyFor(request);
      if (key === null) return;
      const state = await consume(rule, key);
      reply
        .header('ratelimit-limit', String(rule.max))
        .header('ratelimit-remaining', String(Math.max(0, rule.max - state.count)));
      if (state.count > rule.max) throw new RateLimitError(state.retryAfterSeconds);
    };
  }

  return {
    consume,
    peek,
    reset,
    byIp: (rule) => enforce(rule, (request) => request.ip),
    byUser: (rule) => enforce(rule, (request) => request.userId),
  };
}