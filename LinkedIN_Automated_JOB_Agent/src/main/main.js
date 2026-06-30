/**
 * main.js — Electron entry point for Nexora
 * Publisher: Bosket's Tech Ventures
 */

const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Menu } = require('electron');
const path    = require('path');
const fs      = require('fs');
const store   = require('./store');
const tray    = require('./tray');
const ipc     = require('./ipc-handlers');
const sched   = require('./scheduler');
const users   = require('./users');

// ── Keep the server alive on crashes ─────────────────────────────────────────
process.on('uncaughtException',   (e) => console.error('[FATAL] uncaughtException:',   e.message));
process.on('unhandledRejection',  (r) => console.error('[FATAL] unhandledRejection:',  r));

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
const isDev = process.argv.includes('--dev');

// ── Window factory ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1100,
    height: 760,
    minWidth:  900,
    minHeight: 620,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  // ALWAYS start at the login screen — every launch shows the profile
  // selection cards, even if only one user exists. Auto-login was explicitly
  // rejected: "Every start should be a fresh start with the login card."
  // The active user/store is only ever set when a card is clicked
  // (see app:login-user → userStoreModule.activateUserSession in ipc-handlers.js).
  loadPage('login');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });
  });

  mainWindow.on('close', (e) => {
    if (store.get('app.minimizeToTray', true)) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Tell the floating control bar whether the Dashboard window currently has
  // OS focus, so it can show "Return to Chrome" when Dashboard is focused, or
  // "Dashboard" when the user is looking at Chrome instead.
  const floatingWindow = require('./floating-window');
  mainWindow.on('focus', () => floatingWindow.send('app:focus-state', { dashboardFocused: true }));
  mainWindow.on('blur',  () => floatingWindow.send('app:focus-state', { dashboardFocused: false }));

  return mainWindow;
}

let lastNonDocsPage = 'dashboard';  // remembers where to return after viewing Help

function loadPage(page, opts) {
  const pages = {
    login:     'login/index.html',
    setup:     'setup/index.html',
    dashboard: 'dashboard/index.html',
    settings:  'settings/index.html',
    profile:   'profile/index.html',
    docs:      'docs/index.html'
  };
  if (page !== 'docs') lastNonDocsPage = page;
  const file = pages[page] || pages.dashboard;
  mainWindow.loadFile(path.join(__dirname, '../renderer', file), opts && opts.query ? { query: opts.query } : undefined);
  // Force OS-level AND renderer-level focus after each navigation. Without
  // this, Electron can leave the window "visually active" but Chromium's
  // internal focus state stuck on the PREVIOUS page — inputs look present
  // but don't respond to clicks/typing until the user alt-tabs away and
  // back (which forces Chromium to re-evaluate focus). A single
  // mainWindow.focus() call was NOT sufficient — it only restores OS-level
  // window focus, not Chromium's internal page-focus state. The reliable
  // fix is a blur() + focus() cycle (forces Chromium to fully re-establish
  // focus) PLUS explicitly focusing webContents itself, after a short delay
  // so it runs once layout has actually settled.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.blur();
      mainWindow.focus();
      mainWindow.webContents.focus();
    }, 60);
  });
}

// Maps each screen to its documentation topic anchor. Used by both the F1
// hotkey and the Help menu item, so pressing F1 anywhere always opens docs
// scrolled to the section that actually explains what's on screen.
const TOPIC_BY_PAGE = {
  login: 'login', setup: 'setup', dashboard: 'dashboard',
  settings: 'settings', profile: 'profile'
};

function openHelp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const fromPage = lastNonDocsPage;
  const topic = TOPIC_BY_PAGE[fromPage] || 'getting-started';
  loadPage('docs', { query: { topic, from: fromPage } });
}

function showAboutDialog() {
  const pkg = require('../../package.json');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Nexora',
    message: 'Nexora',
    detail:
      `Version ${pkg.version}\n` +
      `Gets smarter with every application.\n\n` +
      `Publisher: Bosket's Tech Ventures\n\n` +
      `An intelligent LinkedIn job-application agent that runs entirely on ` +
      `your own computer — your profile and credentials never leave your machine.`,
    buttons: ['OK'],
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  });
}

// Custom application menu — replaces Electron's default menu, which shows a
// generic "Help > Learn More" pointing at electronjs.org and is irrelevant to
// Nexora. "About Nexora" now shows real product info; "Nexora Help" (F1)
// opens our own in-app documentation.
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Switch User',
          click: () => {
            // Mirror the Dashboard's "⇄ Switch" button: clear the active user
            // and their store, not just navigate, so state stays consistent.
            users.setActiveUser(null);
            require('./user-store').clearActiveUserStore();
            loadPage('login');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: isDev
        ? [{ role: 'reload' }, { role: 'toggleDevTools' }]
        : [{ role: 'reload' }]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Nexora Help', accelerator: 'F1', click: () => openHelp() },
        { type: 'separator' },
        { label: 'About Nexora', click: () => showAboutDialog() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Second instance → bring window to front ───────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildAppMenu();
  createWindow();
  tray.init(mainWindow, loadPage);
  ipc.register(mainWindow, loadPage);
  sched.init(mainWindow);

  // Ensure Playwright Chromium is installed (runs in background, first boot only)
  ensurePlaywrightBrowser();

  // ── Global pause/resume hotkey ──────────────────────────────────────────
  // Works system-wide — including while the Chrome window the agent is
  // driving has OS focus — so the user never has to alt-tab to pause.
  globalShortcut.register('Control+Alt+P', () => {
    ipc.togglePauseFromShortcut();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows: keep running in tray if minimizeToTray is on
    if (!store.get('app.minimizeToTray', true)) app.quit();
  }
});

app.on('before-quit', () => {
  tray.destroy();
  sched.stop();
  globalShortcut.unregisterAll();
});

// ── Navigate IPC (from renderer) ──────────────────────────────────────────────
ipcMain.on('app:navigate', (_, page) => loadPage(page));
ipcMain.on('app:open-external', (_, url) => shell.openExternal(url));
ipcMain.on('app:open-help', () => openHelp());

// ── Playwright browser auto-install ──────────────────────────────────────────
function ensurePlaywrightBrowser() {
  try {
    const { execFile } = require('child_process');
    const playwrightPath = require.resolve('playwright/cli');
    execFile(process.execPath, [playwrightPath, 'install', 'chromium'], { timeout: 120000 },
      (err) => { if (err) console.warn('Playwright install warning:', err.message); }
    );
  } catch (e) {
    console.warn('Could not auto-install Playwright Chromium:', e.message);
  }
}

module.exports = { loadPage, getMainWindow: () => mainWindow };
