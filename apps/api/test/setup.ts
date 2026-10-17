if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Refusing to run tests against a non-test database');
}