const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Thin desktop wrapper: a window onto the hosted CCP Time web app, kept in the tray.
 * It does no activity tracking. Device activity comes from desktop-agent/, which
 * authenticates with a device key issued by the CEO in Settings.
 */

// The hosted web app. Point CCP_WEB_URL at the deployment in production;
// it defaults to the local Next.js dev server.
const WEB_URL = process.env.CCP_WEB_URL || 'http://localhost:3000';
const WEB_ORIGIN = new URL(WEB_URL).origin;

let mainWindow = null;
let tray = null;
let quitting = false;

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
  // The app lives on in the tray; Quit comes from its menu.
  if (!quitting) return;
  if (tray) tray.destroy();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (mainWindow) mainWindow.show();
});
