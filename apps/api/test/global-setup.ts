import { execSync } from 'node:child_process';
import path from 'node:path';

export default function setup(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl?.includes('_test')) {
    throw new Error('Refusing to migrate: TEST_DATABASE_URL must contain "_test"');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(process.cwd(), '../../packages/db'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}