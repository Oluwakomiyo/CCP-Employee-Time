import dotenv from 'dotenv';
dotenv.config();

import { assertRequiredEnv } from './config/env';
assertRequiredEnv();

import { prisma } from './config/prisma';
import { startStaleSessionWorker } from './jobs/staleSessionWorker';

/**
 * Standalone entry for the stale-session job (compose `worker` service).
 * The API also starts this worker in-process; run only one of them against
 * a database (the job is idempotent, so overlap is safe but wasteful).
 */
async function main() {
  await prisma.$connect();
  console.log('✅ Worker connected to PostgreSQL');
  const stop = startStaleSessionWorker();

  const shutdown = async () => {
    stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(async (err) => {
  console.error('❌ Worker failed to start:', err);
  await prisma.$disconnect();
  process.exit(1);
});
