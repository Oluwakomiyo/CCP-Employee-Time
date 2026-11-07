const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notifyLogin: (authData) => ipcRenderer.invoke('auth-login-success', authData),
  notifyLogout: () => ipcRenderer.invoke('auth-logout'),
});