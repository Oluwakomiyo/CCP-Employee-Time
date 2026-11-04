import { staleSessionService } from '../modules/time/stale-session.service';

/**
 * Initializes a recurring background worker that checks for abandoned sessions.
 * Default interval: Every 30 minutes.
 */
export const startStaleSessionWorker = (intervalMs = 30 * 60 * 1000) => {
  console.log('⏰ Stale session auto-close background worker initialized.');

  const runWorker = async () => {
    try {
      const result = await staleSessionService.autoCloseStaleSessions(16, 8);
      if (result.closedCount > 0) {
        console.log(
          `[Worker] Auto-closed ${result.closedCount} abandoned segments:`,
          result.processedSegmentIds
        );
      }
    } catch (err) {
      console.error('[Worker Error] Failed executing stale session cleanup:', err);
    }
  };

  // Run initial check upon server start
  runWorker();

  // Schedule periodic execution
  const intervalId = setInterval(runWorker, intervalMs);

  return () => clearInterval(intervalId);
};