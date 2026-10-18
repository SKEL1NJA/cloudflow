if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Refusing to run tests against a non-test database');
}
if (!process.env.REDIS_URL?.endsWith('/1')) {
  throw new Error('Refusing to run tests against the development Redis database');
}