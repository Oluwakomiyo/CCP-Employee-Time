import dotenv from 'dotenv';
dotenv.config();

import { assertRequiredEnv } from './config/env';
assertRequiredEnv();

import { createApp } from './app';
import { prisma } from './config/prisma';
import { startStaleSessionWorker } from './jobs/staleSessionWorker';

const app = createApp();
const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL database via Prisma');

    // The missing clock-out job runs here unless a separate worker process owns it
    // (docker-compose sets RUN_STALE_WORKER=false on the api and runs src/worker.ts).
    const stopWorker = process.env.RUN_STALE_WORKER === 'false' ? () => undefined : startStaleSessionWorker();

    const server = app.listen(PORT, () => {
      console.log(`🚀 API Server running at http://localhost:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    const shutdown = async () => {
      console.log('Gracefully terminating server...');
      stopWorker();
      server.close(async () => {
        await prisma.$disconnect();
        console.log('Database disconnected. Exiting.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  }
}

bootstrap();