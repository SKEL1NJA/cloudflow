import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
