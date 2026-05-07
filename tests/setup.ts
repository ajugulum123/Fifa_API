// Vitest globalSetup. Runs once before any test files load. The JWT module reads
// JWT_ACCESS_SECRET and JWT_REFRESH_SECRET at import time, so they must be present
// before any test imports happen.

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_at_least_32_chars_long_xx';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret_at_least_32_chars_long_xx';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'TestPassword123!';
