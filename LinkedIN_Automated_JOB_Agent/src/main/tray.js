/**
 * tray.js — System tray icon and context menu for Nexora.
 * Publisher: Bosket's Tech Ventures
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let trayInstance = null;

function init(mainWindow, loadPage) {
  const iconPath = path.join(__dirname, '../../assets/icons/tray-icon.png');
  let img;
  try {
    img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) img = nativeImage.createEmpty();
  } catch { img = nativeImage.createEmpty(); }

  trayInstance = new Tray(img);
  trayInstance.setToolTip("Nexora — Gets smarter with every application.");

  const buildMenu = (isRunning) => Menu.buildFromTemplate([
    { label: 'Nexora by Bosket\'s Tech Ventures', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => { mainWindow.show(); mainWindow.focus(); loadPage('dashboard'); }
    },
    {
      label: isRunning ? '⏳ Applying to jobs...' : '▶ Run Now',
      enabled: !isRunning,
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        loadPage('dashboard');
        mainWindow.webContents.executeJavaScript(
          'window._triggerRunFromTray && window._triggerRunFromTray()'
        ).catch(() => {});
      }
    },
    { type: 'separator' },
    {
      label: 'My Profile',
      click: () => { mainWindow.show(); mainWindow.focus(); loadPage('profile'); }
    },
    {
      label: 'Settings',
      click: () => { mainWindow.show(); mainWindow.focus(); loadPage('settings'); }
    },
    { type: 'separator' },
    {
      label: 'Quit Nexora',
      click: () => { app.exit(0); }
    }
  ]);

  trayInstance.setContextMenu(buildMenu(false));

  trayInstance.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return trayInstance;
}

function setRunning(isRunning) {
  if (trayInstance) {
    trayInstance.setToolTip(
      isRunning ? 'Nexora — Applying to jobs...' : 'Nexora — Idle'
    );
  }
}

function destroy() {
  if (trayInstance) { trayInstance.destroy(); trayInstance = null; }
}

module.exports = { init, setRunning, destroy };
