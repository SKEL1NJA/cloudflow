import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const rootEnvPath = path.resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  WORKER_METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(9101),
  WORKER_METRICS_HOST: z.string().default('127.0.0.1'),
  RECONCILER_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
  RECONCILER_GRACE_MS: z.coerce.number().int().min(5000).default(60_000),
  RECONCILER_STUCK_RUNNING_MS: z.coerce.number().int().min(330_000).default(600_000),
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(0).default(3_600_000),
  HTTP_ALLOW_PRIVATE_NETWORK: z.stringbool().default(false),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:\n' + z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();