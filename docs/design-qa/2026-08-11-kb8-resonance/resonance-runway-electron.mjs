import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1225,
    height: 768,
    show: false,
    webPreferences: { contextIsolation: true },
  });

  await window.loadURL(process.argv.at(-1));
  window.showInactive();
});
