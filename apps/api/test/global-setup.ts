import { createRedisClient } from '@cloudflow/queue';
import { execSync } from 'node:child_process';
import path from 'node:path';

export default async function setup(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl?.includes('_test')) {
    throw new Error('Refusing to migrate: TEST_DATABASE_URL must contain "_test"');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(process.cwd(), '../../packages/db'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  redisUrl.pathname = '/1';
  const redis = createRedisClient(redisUrl.toString());
  await redis.flushdb();
  redis.disconnect();
}