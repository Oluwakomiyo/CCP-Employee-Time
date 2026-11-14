import { staleSessionService } from '../modules/time/stale-session.service';

/**
 * Periodically flags workdays with a missing clock-out (spec §53). Idempotent, so running
 * it every 30 minutes (and on start-up) is safe.
 */
export const startStaleSessionWorker = (intervalMs = 30 * 60 * 1000) => {
  const run = async () => {
    try {
      const result = await staleSessionService.flagMissingClockOuts(16);
      if (result.flaggedCount > 0) {
        console.log(`[Worker] Flagged ${result.flaggedCount} missing clock-out(s):`, result.segmentIds);
      }
    } catch (err) {
      console.error('[Worker Error] Missing clock-out check failed:', err);
    }
  };

  run();
  const intervalId = setInterval(run, intervalMs);
  return () => clearInterval(intervalId);
};
