import dotenv from 'dotenv';
dotenv.config();

// Tests always run against the dedicated test database, never the dev one.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
process.env.NODE_ENV = 'test';
process.env.COMPANY_TZ ||= 'Africa/Lagos';
process.env.ALLOWED_ORIGINS ||= 'http://localhost:3000';
process.env.JWT_SECRET ||= 'test-access-secret-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret-0123456789';
// Time-engine tests move the clock forward by hours; keep test tokens valid across those jumps.
process.env.JWT_EXPIRES_IN = '30d';
