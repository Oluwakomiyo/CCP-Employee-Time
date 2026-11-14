import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); // Run from the agent's own directory.

// Refuse plain HTTP outside local development: device keys must not travel in the clear.
const apiUrl = new URL(config.apiUrl);
const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname);
if (apiUrl.protocol !== 'https:' && !isLocalhost) {
  console.error(`Refusing to send device telemetry over plain HTTP to ${apiUrl.host}. Use an https:// apiUrl.`);
  process.exit(1);
}

/**
 * Reads OS idle seconds without blocking the event loop. Resolves to null
 * when the platform has no reader or the read fails; the caller reports
 * UNKNOWN in that case, never "active".
 */
async function getOsIdleSeconds() {
  try {
    if (process.platform === 'win32') {
      // Windows: Query GetLastInputInfo via PowerShell (async, capped at 10s).
      const cmd = `powershell -NoProfile -Command "Add-Type @'
using System; using System.Runtime.InteropServices;
public class User32 {
  [DllImport(\\"user32.dll\\")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  public static uint GetIdle() {
    LASTINPUTINFO l = new LASTINPUTINFO(); l.cbSize = (uint)Marshal.SizeOf(l);
    GetLastInputInfo(ref l);
    return ((uint)Environment.TickCount - l.dwTime) / 1000;
  }
}
'@; [User32]::GetIdle()"`;
      const { stdout } = await run('powershell', ['-NoProfile', '-Command', cmd], { timeout: 10_000 });
      const seconds = parseInt(stdout.trim(), 10);
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
    }
    if (process.platform === 'darwin') {
      // macOS: HIDIdleTime comes back in nanoseconds.
      const { stdout } = await run('ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { timeout: 10_000 });
      const match = stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);
      if (!match) return null;
      return Math.floor(Number(match[1]) / 1_000_000_000);
    }
    if (process.platform === 'linux') {
      // Linux: xprintidle reports milliseconds of X11 idle time.
      const { stdout } = await run('xprintidle', [], { timeout: 10_000 });
      const ms = parseInt(stdout.trim(), 10);
      return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 1000) : null;
    }
  } catch {
    return null; // Missing tool, timeout, or parse failure: unknown, not active.
  }
  return null;
}

async function sendHeartbeat() {
  const idleSeconds = await getOsIdleSeconds();
  // Unknown stays unknown: without a reading we must not claim activity.
  const sessionStatus = idleSeconds === null ? 'UNKNOWN' : idleSeconds >= config.idleThresholdSeconds ? 'IDLE' : 'ACTIVE';

  try {
    const res = await fetch(`${config.apiUrl}/activity/agent-heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': config.deviceKey,
      },
      body: JSON.stringify({
        deviceIdentifier: config.deviceIdentifier,
        clientTimestamp: new Date().toISOString(),
        sessionStatus,
        idleSeconds: idleSeconds ?? 0,
      }),
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] Pulse sent -> Status: ${sessionStatus} | OS Idle: ${idleSeconds ?? 'unknown'}s`);
    } else {
      const err = await res.json();
      console.warn(`[${new Date().toLocaleTimeString()}] Heartbeat rejected:`, err.error?.message ?? err.message);
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Cannot connect to server:`, err.message);
  }
}

console.log('==================================================');
console.log('🚀 CCP Engineering Desktop Activity Agent Started');
console.log(`📡 Device: ${config.deviceIdentifier}`);
console.log(`⏱️ Interval: Every ${config.heartbeatIntervalSeconds}s (OS Idle Threshold: ${config.idleThresholdSeconds}s)`);
console.log('==================================================');

// Send initial pulse immediately on boot
sendHeartbeat();

// Schedule heartbeat interval (a slow read resolves whenever it resolves;
// overlapping ticks are harmless heartbeats, never a blocked loop).
setInterval(sendHeartbeat, config.heartbeatIntervalSeconds * 1000);
