import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const useBrowserHeartbeat = (isClockedIn: boolean) => {
  const { isAuthenticated } = useAuth();
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isAuthenticated || !isClockedIn) return;

    // Reset idle timer on user mouse or keyboard activity
    const recordUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', recordUserActivity);
    window.addEventListener('keydown', recordUserActivity);
    window.addEventListener('scroll', recordUserActivity);

    // Transmit browser heartbeat every 60 seconds
    const interval = setInterval(async () => {
      try {
        const idleSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);
        await api.post('/time/heartbeat', {
          clientTimestamp: new Date().toISOString(),
          idleSeconds,
        });
      } catch (err) {
        console.warn('[Heartbeat] Failed to transmit session pulse:', err);
      }
    }, 60 * 1000);

    return () => {
      window.removeEventListener('mousemove', recordUserActivity);
      window.removeEventListener('keydown', recordUserActivity);
      window.removeEventListener('scroll', recordUserActivity);
      clearInterval(interval);
    };
  }, [isAuthenticated, isClockedIn]);
};