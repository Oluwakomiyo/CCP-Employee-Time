const { app, powerMonitor, safeStorage, session } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Activity reporting for the computer this app runs on.
 *
 * 1. Waits until someone signs in inside the app window (reads /auth/me with the window's own cookies).
 * 2. Enrolls this computer for them (POST /activity/devices/enroll) and keeps the device key encrypted
 *    on disk with the OS keychain (safeStorage).
 * 3. Every minute reports ACTIVE or IDLE from the OS idle time. Nothing else: no screenshots, no keys
 *    pressed, no window titles.
 * A revoked device stops reporting and quietly retries enrollment, so an admin's "Reinstate" just works.
 */

const HEARTBEAT_MS = 60_000;
const SIGN_IN_POLL_MS = 30_000;
const REVOKED_RETRY_MS = 5 * 60_000;
const IDLE_THRESHOLD_SECONDS = 300;

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout))));

/** A stable id for this machine, read from the OS (no extra install). Only its hash is ever sent. */
async function machineId() {
  let raw = '';
  if (process.platform === 'win32') {
    const out = await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
    raw = (out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i) || [])[1] || '';
  } else if (process.platform === 'darwin') {
    const out = await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    raw = (out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/) || [])[1] || '';
  } else {
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        raw = fs.readFileSync(f, 'utf8').trim();
        if (raw) break;
      } catch {
        /* try the next one */
      }
    }
  }
  // shortcut: a hostname fallback can collide on renamed machines; fine for the rare OS without an id.
  if (!raw) raw = `host:${os.hostname()}`;
  return crypto.createHash('sha256').update(`ccp:${raw}`).digest('hex');
}

const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

/** The device key, encrypted with the OS keychain. Without a keychain it lives in memory only (re-enrolls on start). */
function keyStore() {
  const file = path.join(app.getPath('userData'), 'device.json');
  let memory = null;
  return {
    load() {
      if (memory) return memory;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        memory = { ...saved, key: safeStorage.decryptString(Buffer.from(saved.key, 'base64')) };
      } catch {
        memory = null;
      }
      return memory;
    },
    save(value) {
      memory = value;
      if (!safeStorage.isEncryptionAvailable()) return;
      const key = safeStorage.encryptString(value.key).toString('base64');
      fs.writeFileSync(file, JSON.stringify({ ...value, key }), { mode: 0o600 });
    },
    clear() {
      memory = null;
      fs.rmSync(file, { force: true });
    },
  };
}

/**
 * Starts reporting. `onStatus(text)` receives a short human status for the tray menu,
 * so reporting is never hidden from the person using the computer.
 */
function startDeviceReporting({ webUrl, onStatus }) {
  const api = `${new URL(webUrl).origin}/api/v1`;
  const store = keyStore();
  let deviceIdentifier = null;
  let timer = null;

  const call = (pathname, init = {}) =>
    session.defaultSession.fetch(`${api}${pathname}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });

  const schedule = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  /** Who is signed in inside the window, or null. */
  async function signedIn() {
    try {
      const res = await call('/auth/me');
      if (!res.ok) return null;
      const body = await res.json();
      return body.data.user;
    } catch {
      return null;
    }
  }

  async function enrollLoop() {
    const user = await signedIn();
    if (!user || !user.employee) {
      onStatus('Activity reporting: sign in to start');
      return schedule(enrollLoop, SIGN_IN_POLL_MS);
    }
    if (!(user.permissions && user.permissions['time.track'])) {
      onStatus('Activity reporting: not needed for your role');
      return schedule(enrollLoop, REVOKED_RETRY_MS);
    }
    const saved = store.load();
    if (saved && saved.employeeId === user.employee.id && saved.deviceIdentifier === deviceIdentifier) return heartbeatLoop();

    try {
      const res = await call('/activity/devices/enroll', {
        method: 'POST',
        body: JSON.stringify({ deviceIdentifier, deviceName: os.hostname().slice(0, 100), platform: PLATFORM[process.platform] || process.platform }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        store.save({ employeeId: user.employee.id, deviceIdentifier, key: body.data.apiKey });
        return heartbeatLoop();
      }
      const code = body && body.error && body.error.code;
      onStatus(
        code === 'DEVICE_REVOKED'
          ? 'Activity reporting off: an admin turned this computer off'
          : code === 'DEVICE_OWNED'
            ? 'Activity reporting off: this computer belongs to someone else'
            : 'Activity reporting: could not register this computer',
      );
      return schedule(enrollLoop, REVOKED_RETRY_MS);
    } catch {
      onStatus('Activity reporting: offline, retrying');
      return schedule(enrollLoop, SIGN_IN_POLL_MS);
    }
  }

  async function heartbeatLoop() {
    const saved = store.load();
    if (!saved) return enrollLoop();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    try {
      const res = await call('/activity/agent-heartbeat', {
        method: 'POST',
        headers: { 'X-Device-Key': saved.key },
        body: JSON.stringify({
          deviceIdentifier: saved.deviceIdentifier,
          clientTimestamp: new Date().toISOString(),
          sessionStatus: idleSeconds >= IDLE_THRESHOLD_SECONDS ? 'IDLE' : 'ACTIVE',
          idleSeconds,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        // Revoked, or the key was replaced: forget it and try enrolling again later.
        store.clear();
        onStatus('Activity reporting off: ask your admin');
        return schedule(enrollLoop, REVOKED_RETRY_MS);
      }
      onStatus('Activity reporting on (active or idle only)');
    } catch {
      onStatus('Activity reporting: offline, retrying');
    }
    schedule(heartbeatLoop, HEARTBEAT_MS);
  }

  machineId().then((id) => {
    deviceIdentifier = id;
    enrollLoop();
  });

  return () => clearTimeout(timer);
}

module.exports = { startDeviceReporting };
