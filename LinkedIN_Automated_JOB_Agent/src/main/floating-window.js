/**
 * floating-window.js — Always-on-top mini control bar shown while the agent runs.
 *
 * WHY: Pausing previously required switching from Chrome back to the Dashboard
 * window, which the user found impractical while watching the form fill in
 * real time. This small, draggable, always-on-top window sits above Chrome so
 * Pause/Resume is reachable without ever leaving the browser view.
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

let win = null;
let _ready = false;          // true once the page has finished its first load
let _pendingSends = [];      // events sent before the page was ready get replayed

function create() {
  if (win && !win.isDestroyed()) return win;

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth  = 380;  // widened to fit the Skip Job button alongside Pause/Dashboard
  const winHeight = 192;

  _ready = false;
  win = new BrowserWindow({
    width:  winWidth,
    height: winHeight,
    useContentSize: true,
    // Bottom-right corner — stays clear of Chrome's tab bar / address bar / LinkedIn nav
    x: Math.max(0, width  - winWidth  - 18),
    y: Math.max(0, height - winHeight - 18),
    frame:        false,
    resizable:    false,
    movable:      true,
    alwaysOnTop:  true,
    skipTaskbar:  true,
    show:         false,
    transparent:  true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload:         path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  // 'screen-saver' level keeps it above the Chrome window even when Chrome is focused
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // CRITICAL: events sent before the renderer's script has attached its
  // listeners are lost. Previously this caused the floating bar to get stuck
  // showing "Idle" forever (the initial agent:status broadcast arrived before
  // the window finished loading). Queue sends until 'did-finish-load' fires,
  // then replay them in order.
  win.webContents.once('did-finish-load', () => {
    _ready = true;
    const queued = _pendingSends;
    _pendingSends = [];
    queued.forEach(({ channel, data }) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, data);
    });
  });

  win.loadFile(path.join(__dirname, '../renderer/floating-control/index.html'));
  win.on('closed', () => { win = null; _ready = false; _pendingSends = []; });

  return win;
}

function show() {
  const w = create();
  w.show();
}

function hide() {
  if (win && !win.isDestroyed()) win.hide();
}

function send(channel, data) {
  if (!win || win.isDestroyed()) return;
  if (_ready) {
    win.webContents.send(channel, data);
  } else {
    _pendingSends.push({ channel, data });
  }
}

function isVisible() {
  return !!(win && !win.isDestroyed() && win.isVisible());
}

module.exports = { show, hide, send, isVisible };
