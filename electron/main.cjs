const { app, BrowserWindow, Tray, Menu, powerMonitor, ipcMain, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// The hosted web app. Point CCP_WEB_URL at the deployment in production;
// it defaults to the local Next.js dev server.
const WEB_URL = process.env.CCP_WEB_URL || 'http://localhost:3000';
const API_BASE = process.env.CCP_API_URL || 'http://localhost:5000/api/v1';

let mainWindow = null;
let tray = null;
let heartbeatTimer = null;
let quitting = false;
let activeSession = null; // { token, employeeId, deviceKey, deviceIdentifier }

const iconPath = path.join(__dirname, '../web/public/ccp-logo.png');
const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: appIcon,
    title: 'CCP Time',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(WEB_URL);

  // Minimize to tray instead of closing, until the user quits from the menu.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  if (tray) return;
  tray = new Tray(appIcon);
  tray.setToolTip('CCP Time');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open CCP Time', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

// Only pulse while the employee is clocked in (WORKING or ON_BREAK).
// Anything else (not started, finished, unreachable API) skips the heartbeat
// so off-hours never fabricate activity.
async function clockedIn() {
  if (!activeSession?.token) return false;
  try {
    const res = await fetch(`${API_BASE}/time/today`, {
      headers: { Authorization: `Bearer ${activeSession.token}` },
    });
    if (!res.ok) return false;
    const body = await res.json();
    const state = body?.data?.state;
    return state === 'WORKING' || state === 'ON_BREAK';
  } catch {
    return false;
  }
}

// NATIVE OS-LEVEL TELEMETRY (Tracks AutoCAD, Revit, etc.)
async function sendNativeHeartbeat() {
  if (!activeSession?.deviceKey || !activeSession?.deviceIdentifier) return;
  if (!(await clockedIn())) return;

  const idleSeconds = powerMonitor.getSystemIdleTime();
  const sessionStatus = idleSeconds >= 300 ? 'IDLE' : 'ACTIVE';

  try {
    await fetch(`${API_BASE}/activity/agent-heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': activeSession.deviceKey,
      },
      body: JSON.stringify({
        deviceIdentifier: activeSession.deviceIdentifier,
        clientTimestamp: new Date().toISOString(),
        sessionStatus,
        idleSeconds,
      }),
    });
  } catch (err) {
    console.warn('[Desktop Agent] Heartbeat error:', err.message);
  }
}

// IPC: Automatically enroll device on user login
ipcMain.handle('auth-login-success', async (_, authData) => {
  const { token, employee } = authData;
  const deviceIdentifier = `PC-${os.hostname().toUpperCase()}`;

  try {
    // Check or auto-register device with backend (CEO registers employee devices).
    const res = await fetch(`${API_BASE}/activity/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        employeeId: employee.id,
        deviceName: `${employee.firstName}'s Workstation (${os.hostname()})`,
        deviceIdentifier,
        platform: `${os.type()} ${os.release()}`,
      }),
    });

    const data = await res.json();
    const deviceKey = data?.data?.apiKey;

    activeSession = {
      token,
      employeeId: employee.id,
      deviceIdentifier,
      deviceKey: deviceKey || activeSession?.deviceKey,
    };

    // Start 60-second native OS pulses
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sendNativeHeartbeat();
    heartbeatTimer = setInterval(sendNativeHeartbeat, 60 * 1000);

    return { success: true, enrolled: true };
  } catch (err) {
    console.error('[Desktop Agent] Auto-enrollment error:', err.message);
    return { success: false };
  }
});

// IPC: Stop telemetry on user sign out
ipcMain.handle('auth-logout', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  activeSession = null;
  return { success: true };
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ccp.timesystems');
  }

  createWindow();
  createTray();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  // The tracker lives on in the tray; Quit comes from its menu.
  if (!quitting) return;
  if (tray) tray.destroy();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (mainWindow) mainWindow.show();
});
