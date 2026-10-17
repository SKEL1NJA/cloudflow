import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl?.includes('_test')) {
  throw new Error('TEST_DATABASE_URL must be set and point at a database whose name contains "_test"');
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: 'redis://127.0.0.1:6379/1',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      JWT_EXPIRES_IN: '1h',
    },
  },
});