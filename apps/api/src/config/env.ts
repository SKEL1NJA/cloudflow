import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const rootEnvPath = path.resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const originsSchema = z.string().transform((value, ctx) => {
  const origins: string[] = [];
  for (const entry of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(entry);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== entry) throw new Error();
      origins.push(entry);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: `"${entry}" is not a valid origin, expected something like https://app.example.com`,
      });
      return z.NEVER;
    }
  }
  return origins;
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'use a format like 15m, 1h or 7d')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGINS: originsSchema.default(['http://localhost:5173', 'http://127.0.0.1:5173']),
  TRUST_PROXY: z.stringbool().default(false),
  RATE_LIMIT_ENABLED: z.stringbool().default(true),
  DOCS_ENABLED: z.stringbool().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),
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