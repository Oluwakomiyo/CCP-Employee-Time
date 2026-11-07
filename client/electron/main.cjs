const { app, BrowserWindow, Tray, Menu, powerMonitor, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const iconPath = path.join(__dirname, '../public/ccp-logo.png');

let mainWindow = null;
let tray = null;
let heartbeatTimer = null;
let activeSession = null; // { token, employeeId, deviceKey, deviceIdentifier }

const isDev = !app.isPackaged;
const API_BASE = 'http://localhost:5000/api/v1';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    title: 'CCP Time Systems',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Minimize to tray instead of closing when employee is working
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Use a default tray context menu
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open CCP Punch Clock', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  // Create simple tray instance
  tray = new Tray(iconPath); // or your app icon
  tray.setToolTip('CCP Time Systems - Engineering Tracker');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

// 🔴 NATIVE OS-LEVEL TELEMETRY (Tracks AutoCAD, Revit, etc.)
async function sendNativeHeartbeat() {
  if (!activeSession?.deviceKey || !activeSession?.deviceIdentifier) return;

  // powerMonitor reads Windows/Mac system input across all software
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
    // Check or auto-register device with backend
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

// IPC: Stop telemetry on user sign-out
ipcMain.handle('auth-logout', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  activeSession = null;
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});