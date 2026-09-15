// Runs before any test file (and therefore before any src/config/env.ts
// import) so the module-level `loadEnv()` call in env.ts never fails during
// the test run. Values are placeholders, distinct from server/.env.example's
// rejected placeholders, and never used against a real database or secret.
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '4000';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0000000000000000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0000000000000000';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/rango-test-placeholder';
