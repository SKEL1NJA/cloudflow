import { Redis } from 'ioredis';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  const options: RedisConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db: Number.isInteger(db) ? db : 0,
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};
  return options;
}

export function createRedisClient(redisUrl: string): Redis {
  return new Redis({ ...parseRedisUrl(redisUrl), maxRetriesPerRequest: 1 });
}