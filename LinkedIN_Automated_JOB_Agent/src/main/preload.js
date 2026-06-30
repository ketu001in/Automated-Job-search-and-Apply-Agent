/**
 * preload.js — Secure bridge between Electron main process and renderer.
 * Exposes only explicitly whitelisted IPC calls to the renderer.
 * contextIsolation: true keeps Node.js APIs out of the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // ── Multi-user management ─────────────────────────────────────────────────
  getAllUsers:      ()      => ipcRenderer.invoke('app:get-all-users'),
  findUserByEmail:  (email) => ipcRenderer.invoke('app:find-user-email', email),
  createUser:       (data)  => ipcRenderer.invoke('app:create-user', data),
  loginUser:        (id)    => ipcRenderer.invoke('app:login-user', id),
  getActiveUser:    ()      => ipcRenderer.invoke('app:get-active-user'),
  logout:           ()      => ipcRenderer.invoke('app:logout'),

  // ── Profile & Setup ───────────────────────────────────────────────────────
  getProfile:    ()     => ipcRenderer.invoke('app:get-profile'),
  saveProfile:   (data) => ipcRenderer.invoke('app:save-profile', data),
  getSetupDone:  ()     => ipcRenderer.invoke('app:get-setup-done'),
  markSetupDone: ()     => ipcRenderer.invoke('app:mark-setup-done'),

  // ── CV Parsing ────────────────────────────────────────────────────────────
  parseCV:       (data) => ipcRenderer.invoke('app:parse-cv', data),
  parseCVUrl:    (url)  => ipcRenderer.invoke('app:parse-cv-url', url),

  // ── Agent Control ─────────────────────────────────────────────────────────
  runAgent:      ()     => ipcRenderer.invoke('app:run-agent'),
  stopAgent:     ()     => ipcRenderer.invoke('app:stop-agent'),
  forceStopAgent:()     => ipcRenderer.invoke('app:force-stop-agent'),
  pauseAgent:    ()     => ipcRenderer.invoke('app:pause-agent'),
  resumeAgent:   ()     => ipcRenderer.invoke('app:resume-agent'),
  skipJob:       ()     => ipcRenderer.invoke('app:skip-job'),
  isPaused:      ()     => ipcRenderer.invoke('app:is-paused'),
  getAgentStatus:()     => ipcRenderer.invoke('app:get-agent-status'),
  signOff:       ()     => ipcRenderer.invoke('app:sign-off'),
  focusChrome:   ()     => ipcRenderer.invoke('app:focus-chrome'),
  getLogs:       ()     => ipcRenderer.invoke('app:get-logs'),
  getLastReport: ()     => ipcRenderer.invoke('app:get-last-report'),
  getQuestionBankCount: () => ipcRenderer.invoke('app:get-question-bank-count'),
  getQuestionBank:      () => ipcRenderer.invoke('app:get-question-bank'),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings:   ()     => ipcRenderer.invoke('app:get-settings'),
  saveSettings:  (data) => ipcRenderer.invoke('app:save-settings', data),

  // ── License ───────────────────────────────────────────────────────────────
  getLicense:    ()     => ipcRenderer.invoke('app:get-license'),
  downloadReport:(args) => ipcRenderer.invoke('app:download-report', args),
  activateLicense:(key) => ipcRenderer.invoke('app:activate-license', key),

  // ── Navigation ────────────────────────────────────────────────────────────
  navigate:      (page) => ipcRenderer.send('app:navigate', page),
  openExternal:  (url)  => ipcRenderer.send('app:open-external', url),
  openHelp:      ()     => ipcRenderer.send('app:open-help'),

  // ── File dialog ───────────────────────────────────────────────────────────
  pickCVFile:    ()     => ipcRenderer.invoke('app:pick-cv-file'),

  // ── Events: main → renderer ───────────────────────────────────────────────
  onAgentLog:        (cb) => ipcRenderer.on('agent:log',         (_, d) => cb(d)),
  onAgentStatus:     (cb) => ipcRenderer.on('agent:status',      (_, d) => cb(d)),
  onAgentReport:     (cb) => ipcRenderer.on('agent:report',      (_, d) => cb(d)),
  onScheduleFired:   (cb) => ipcRenderer.on('schedule:fired',    (_, d) => cb(d)),
  onAgentRunComplete:(cb) => ipcRenderer.on('agent:run-complete', (_, d) => cb(d)),
  onFocusState:      (cb) => ipcRenderer.on('app:focus-state',    (_, d) => cb(d)),

  // ── Cleanup ───────────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
