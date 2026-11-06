import fs from 'fs';
import { execSync } from 'child_process';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Cross-platform OS idle time detection
function getOsIdleSeconds() {
  try {
    if (process.platform === 'win32') {
      // Windows: Query GetLastInputInfo via PowerShell
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
      const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      return parseInt(output, 10) || 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

async function sendHeartbeat() {
  const idleSeconds = getOsIdleSeconds();
  const sessionStatus = idleSeconds >= config.idleThresholdSeconds ? 'IDLE' : 'ACTIVE';

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
        idleSeconds,
      }),
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] Pulse sent -> Status: ${sessionStatus} | OS Idle: ${idleSeconds}s`);
    } else {
      const err = await res.json();
      console.warn(`[${new Date().toLocaleTimeString()}] Heartbeat rejected:`, err.message);
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

// Schedule heartbeat interval
setInterval(sendHeartbeat, config.heartbeatIntervalSeconds * 1000);