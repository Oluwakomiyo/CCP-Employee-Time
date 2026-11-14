import dotenv from 'dotenv';
dotenv.config();

import { assertRequiredEnv } from './config/env';
assertRequiredEnv();

import { prisma } from './config/prisma';
import { startStaleSessionWorker } from './jobs/staleSessionWorker';

/**
 * Standalone entry for the stale-session job (compose `worker` service).
 * The API runs the same job in-process unless RUN_STALE_WORKER=false, which
 * docker-compose sets on the api service so the job runs once.
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
