const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { startDeviceReporting } = require('./device.cjs');

/**
 * The CCP Time desktop app: a window onto the hosted web app, kept in the tray.
 * Once someone signs in, it registers this computer to them and reports only whether
 * the computer is active or idle (device.cjs). The tray menu always shows that status.
 */

// The hosted web app. Installers bake in the production address (package.json "ccp.webUrl");
// CCP_WEB_URL overrides it, and development falls back to the local Next.js dev server.
const WEB_URL = process.env.CCP_WEB_URL || (app.isPackaged && require('./package.json').ccp.webUrl) || 'http://localhost:3000';
const WEB_ORIGIN = new URL(WEB_URL).origin;

let mainWindow = null;
let tray = null;
let quitting = false;

const iconPath = path.join(__dirname, 'build/icon.png');
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
      sandbox: true,
    },
  });

  // The window only ever shows CCP Time; any other link opens in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== WEB_ORIGIN) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
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

let reportingStatus = 'Activity reporting: starting';

function createTray() {
  if (tray) return;
  tray = new Tray(appIcon);
  tray.setToolTip('CCP Time');
  tray.on('double-click', () => mainWindow && mainWindow.show());
  updateTrayMenu();
}

/** Rebuilt whenever the reporting status changes, so the person always sees it. */
function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(`CCP Time\n${reportingStatus}`);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open CCP Time', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: reportingStatus, enabled: false },
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
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ccp.timesystems');
  }

  createWindow();
  createTray();
  startDeviceReporting({
    webUrl: WEB_URL,
    onStatus: (text) => {
      if (text === reportingStatus) return;
      reportingStatus = text;
      updateTrayMenu();
    },
  });
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  // The app lives on in the tray; Quit comes from its menu.
  if (!quitting) return;
  if (tray) tray.destroy();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (mainWindow) mainWindow.show();
});
