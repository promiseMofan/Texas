const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const windows = new Set();

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#07110e',
    title: '德州扑克单机版',
    show: true,
    center: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  windows.add(window);
  window.loadFile('index.html');
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('页面加载失败：', code, description);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('渲染进程退出：', details.reason, details.exitCode);
  });
  window.on('unresponsive', () => console.error('应用窗口暂时无响应'));
  window.on('closed', () => {
    windows.delete(window);
  });
};

app.whenReady().then(() => {
  ipcMain.handle('app:version', () => app.getVersion());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
