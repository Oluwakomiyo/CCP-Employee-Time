import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

// Resets the test database to the current migrations once per `npm test` run.
// Skipped when DATABASE_URL_TEST is unset; DB-backed tests then fail with a clear connection error.
export default function setup() {
  dotenv.config();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn('[tests] DATABASE_URL_TEST is not set: database tests will fail.');
    return;
  }
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
