/**
 * ipc-handlers.js — All IPC handlers wiring the renderer to main-process logic.
 */

const { ipcMain, dialog, app } = require('electron');
const path   = require('path');
const fs     = require('fs');
const store  = require('./store');   // global app-settings store (headless, schedule, etc.)
const lic    = require('./license');
const sched  = require('./scheduler');
const userStoreModule = require('./user-store');
const floatingWindow = require('./floating-window');

let agentRunning = false;
let agentPaused  = false;
let logHistory   = [];
const agentState = require('./agent-state');
let _mainWindowRef = null;   // captured in register() for use by togglePauseFromShortcut

// activeStore() now lives in user-store.js so linkedin.js / scheduler.js can
// share the SAME active-user reference — fixes agent using stale/global preferences.
function activeStore() {
  return userStoreModule.activeStore();
}

// Sends an event to BOTH the main Dashboard window AND the floating control
// bar (if visible), so either surface reflects live agent state.
function broadcast(channel, data) {
  if (_mainWindowRef && !_mainWindowRef.isDestroyed()) _mainWindowRef.webContents.send(channel, data);
  floatingWindow.send(channel, data);
}

// Toggle pause/resume — used by BOTH the Dashboard/floating-bar buttons (via
// IPC) AND the global keyboard shortcut (Ctrl+Alt+P) registered in main.js,
// so pausing works no matter which window currently has OS focus.
function togglePauseFromShortcut() {
  if (!agentRunning) return;
  agentPaused = !agentPaused;
  agentState.setPaused(agentPaused);
  broadcast('agent:status', { running: true, paused: agentPaused });
  broadcast('agent:log', {
    time: new Date().toISOString(),
    message: agentPaused
      ? '⏸️  Agent PAUSED (hotkey) — edit values in Chrome, then press Ctrl+Alt+P again.'
      : '▶️  Agent RESUMED (hotkey)',
    type: agentPaused ? 'warning' : 'success'
  });
}

function log(message, type = 'info') {
  const entry = { time: new Date().toISOString(), message, type };
  console.log(`[${type.toUpperCase()}] ${message}`);
  logHistory.push(entry);
  if (logHistory.length > 500) logHistory.shift();
  // Will be broadcast from agent
}

function register(mainWindow, loadPage) {
  const users = require('./users');
  _mainWindowRef = mainWindow;

  // ── User management ────────────────────────────────────────────────────────
  ipcMain.handle('app:get-all-users',    ()         => users.getAllUsers());
  ipcMain.handle('app:find-user-email',  (_, email) => users.findUserByEmail(email));
  ipcMain.handle('app:create-user',      (_, data)  => users.createUser(data));
  // Permanently deletes a user's profile, store, and browser session. The
  // renderer is responsible for the email-verification confirmation flow —
  // by the time this is called, the user has already confirmed twice.
  ipcMain.handle('app:delete-user',      (_, userId) => {
    const wasActive = users.getActiveUserId() === userId;
    const result = users.deleteUser(userId);
    if (wasActive) userStoreModule.clearActiveUserStore();
    return result;
  });
  ipcMain.handle('app:login-user',       (_, id)    => userStoreModule.activateUserSession(id));
  ipcMain.handle('app:get-active-user',  ()         => users.getActiveUser());
  ipcMain.handle('app:logout',           ()         => {
    users.setActiveUser(null);
    userStoreModule.clearActiveUserStore();
    loadPage('login');
    return true;
  });
  ipcMain.handle('app:sign-off',         async ()   => {
    users.setActiveUser(null);
    userStoreModule.clearActiveUserStore();
    loadPage('login');
    return { signedOff: true };
  });

  // ── Profile ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:get-profile', () => {
    const s = activeStore();
    return {
      linkedin:         s.get('linkedin',         {}),
      jobSearchStatus:  s.get('jobSearchStatus',  'actively-searching'),
      profileCategory:  s.get('profileCategory',  'tech'),
      personal:         s.get('personal',         {}),
      address:          s.get('address',          {}),
      education:        s.get('education',        []),
      experience:       s.get('experience',       []),
      preferences:      s.get('preferences',      {}),
      cv:               s.get('cv',               {}),
      schedule:         s.get('schedule',         {}),
      app:              store.get('app',          {})   // app settings always global
    };
  });

  ipcMain.handle('app:save-profile', (_, data) => {
    // All profile data goes into the active user's store (or global as fallback)
    const s = activeStore();

    // ── LinkedIn credentials ──────────────────────────────────────────────
    const linkedin = data.linkedin || (data.liEmail !== undefined
      ? { email: data.liEmail || '', password: data.liPassword || '' } : null);
    if (linkedin) s.set('linkedin', linkedin);

    // ── Job search status ─────────────────────────────────────────────────
    const jobStatus = data.jobSearchStatus || data.jobStatus;
    if (jobStatus !== undefined) s.set('jobSearchStatus', jobStatus);

    // ── Profile category ──────────────────────────────────────────────────
    if (data.profileCategory !== undefined) s.set('profileCategory', data.profileCategory);

    // ── Personal details ──────────────────────────────────────────────────
    const personal = data.personal || (data.firstName !== undefined ? {
      firstName:        data.firstName        || '',
      lastName:         data.lastName         || '',
      email:            data.email            || '',
      phone:            data.phone            || '',
      phoneCountryCode: data.countryCode      || '+91',
      linkedinUrl:      data.linkedinUrl      || '',
      portfolioUrl:     data.portfolioUrl     || ''
    } : null);
    if (personal) s.set('personal', personal);

    // ── Address ───────────────────────────────────────────────────────────
    const address = data.address || (data.addr1 !== undefined ? {
      line1:   data.addr1   || '',
      line2:   data.addr2   || '',
      city:    data.city    || '',
      state:   data.state   || '',
      country: data.country || '',
      pincode: data.pincode || ''
    } : null);
    if (address) s.set('address', address);

    // ── Education ─────────────────────────────────────────────────────────
    if (data.education) {
      s.set('education', data.education.map(e => ({
        institution: e.institution || '',
        degree:      e.degree      || '',
        field:       e.field       || '',
        startYear:   e.startYear   || '',
        endYear:     e.endYear     || '',
        grade:       e.grade       || '',
        gradeType:   (e.gradeType === 'pct' || e.gradeType === 'percentage') ? 'percentage' : 'cgpa'
      })));
    }

    // ── Experience ────────────────────────────────────────────────────────
    if (data.experience) {
      s.set('experience', data.experience.map(e => ({
        company:     e.company     || '',
        title:       e.title       || '',
        startMonth:  e.startMonth  || '',
        startYear:   e.startYear   || '',
        endMonth:    e.endMonth    || '',
        endYear:     e.endYear     || '',
        isCurrent:   e.isCurrent   || e.current || false,
        description: e.description || e.desc    || ''
      })));
    }

    // ── Preferences ───────────────────────────────────────────────────────
    const preferences = data.preferences || (data.targetRoles !== undefined ? {
      targetRoles:            data.targetRoles   || [],
      locations:              data.locationPrefs || [],
      experienceYears:        parseInt(data.expYears)        || 0,
      experienceMonths:       parseInt(data.expMonths)       || 0,
      noticePeriodValue:      parseInt(data.noticePeriodVal) || 0,
      noticePeriodUnit:       data.noticePeriodUnit          || 'days',
      noticePeriodNegotiable: data.negotiable === 'yes',
      joiningAvailability:    data.joinSoon                  || '',
      willingToTravel:        data.willingToTravel === 'yes',
      travelPercentage:       parseInt(data.travelPct)       || 25,
      currentCTC:             parseFloat(data.currentCTC)    || 0,
      expectedCTC:            parseFloat(data.expectedCTC)   || 0,
      ctcUnit:                'LPA'
    } : null);
    if (preferences) s.set('preferences', preferences);

    // ── CV ────────────────────────────────────────────────────────────────
    if (data.cv) s.set('cv', data.cv);

    // ── Schedule ──────────────────────────────────────────────────────────
    const schedule = data.schedule || (data.schedFreq !== undefined ? {
      enabled:    data.schedEnabled  || false,
      frequency:  data.schedFreq     || 'daily',
      time:       data.schedTime     || '10:00',
      dayOfWeek:  parseInt(data.schedDow)  || 1,
      dayOfMonth: parseInt(data.schedDom)  || 1
    } : null);
    if (schedule) { s.set('schedule', schedule); sched.applySchedule(); }

    // ── App settings always go to global store ────────────────────────────
    if (data.app) store.set('app', data.app);

    return { saved: true };
  });

  ipcMain.handle('app:get-setup-done',  () => activeStore().get('setupCompleted', false));
  ipcMain.handle('app:mark-setup-done', () => {
    activeStore().set('setupCompleted', true);
    return true;
  });

  // ── CV Parsing ────────────────────────────────────────────────────────────
  ipcMain.handle('app:pick-cv-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Your CV / Resume',
      properties: ['openFile'],
      filters: [
        { name: 'Resume Files', extensions: ['pdf', 'docx', 'doc'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return { error: 'File exceeds 5 MB limit. Please upload a smaller file.' };
    }
    const fileBuffer = fs.readFileSync(filePath);
    return {
      filename: path.basename(filePath),
      ext:      path.extname(filePath).toLowerCase().replace('.', ''),
      data:     fileBuffer.toString('base64'),
      size:     stat.size
    };
  });

  ipcMain.handle('app:parse-cv', async (_, { filename, ext, data, pastedText }) => {
    const { parseCV, extractProfile, detectProfileCategory } = require('../agent/cv-parser');
    try {
      let rawText = pastedText || '';
      if (!rawText && data) {
        const buf = Buffer.from(data, 'base64');
        rawText = await parseCV(buf, ext || 'txt');
      }
      const extracted = extractProfile(rawText);

      // Auto-detect and save profile category (IT / Non-IT)
      const skills   = (extracted && extracted.skills) || [];
      const category = detectProfileCategory(rawText, skills);
      store.set('profileCategory', category);

      return { success: true, rawText, extracted, detectedCategory: category };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('app:parse-cv-url', async (_, url) => {
    const { parseCVFromUrl, extractProfile, detectProfileCategory } = require('../agent/cv-parser');
    try {
      const rawText    = await parseCVFromUrl(url);
      const extracted  = extractProfile(rawText);
      const skills     = (extracted && extracted.skills) || [];
      const category   = detectProfileCategory(rawText, skills);
      return { success: true, rawText, extracted, detectedCategory: category };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Agent Control ─────────────────────────────────────────────────────────
  ipcMain.handle('app:run-agent', async () => {
    if (agentRunning) return { error: 'Agent is already running.' };
    if (!lic.isValid()) return { error: 'Invalid license. Please check your license key.' };

    agentRunning = true;
    agentPaused  = false;
    agentState.reset();  // clear any previous pause/stop state
    const tray = require('./tray');
    tray.setRunning(true);
    broadcast('agent:status', { running: true, triggeredBy: 'manual' });
    // Show the floating control bar — lets the user pause without switching
    // away from the Chrome window the agent is driving.
    floatingWindow.show();

    // Run async, don't await here (fire and forget, events sent over IPC)
    (async () => {
      try {
        const { runLinkedInAgent } = require('../agent/linkedin');
        const agentLog = (message, type = 'info') => {
          const entry = { time: new Date().toISOString(), message, type };
          logHistory.push(entry);
          if (logHistory.length > 500) logHistory.shift();
          broadcast('agent:log', entry);
        };
        const report = await runLinkedInAgent(agentLog);
        const lastReport = { ...report, triggeredBy: 'manual', completedAt: new Date().toISOString() };

        // ── Per-user cumulative stats (stored in user's own store) ──────────
        const us   = activeStore();   // user's store or global

        // Save lastReport to the SAME store as cumulative stats (user or global)
        us.set('lastReport', lastReport);

        const prev = us.get('cumulativeStats', { totalApplied: 0, totalSkipped: 0, totalErrors: 0, allAppliedJobs: [], manualApplyJobs: [] });

        // Deduplicate by jobId — same job should never appear twice across runs
        const existingIds  = new Set((prev.allAppliedJobs || []).map(j => j.jobId));
        const newJobs      = (report.applied || [])
          .filter(j => !existingIds.has(j.jobId))   // only add genuinely new jobs
          .map(j => ({ ...j, runDate: new Date().toISOString() }));

        // Manual apply jobs — also deduplicate
        const existingManualIds = new Set((prev.manualApplyJobs || []).map(j => j.jobId));
        const newManualJobs     = (report.manualApply || [])
          .filter(j => !existingManualIds.has(j.jobId))
          .map(j => ({ ...j, runDate: new Date().toISOString() }));

        const newStats = {
          totalApplied:    (prev.totalApplied  || 0) + newJobs.length,   // only count NEW jobs
          totalSkipped:    (prev.totalSkipped  || 0) + (report.skipped  || []).length,
          totalErrors:     (prev.totalErrors   || 0) + (report.errors   || []).length,
          allAppliedJobs:  [...(prev.allAppliedJobs || []), ...newJobs].slice(-500),
          manualApplyJobs: [...(prev.manualApplyJobs || []), ...newManualJobs].slice(-200),
          lastUpdated:     new Date().toISOString()
        };
        us.set('cumulativeStats', newStats);

        broadcast('agent:report', {
          ...lastReport,
          cumulativeStats: newStats,
          manualApply: newStats.manualApplyJobs || []  // full accumulated list, not just this run
        });
        agentLog(`✅ Run complete — Applied: ${(report.applied||[]).length} | Skipped: ${(report.skipped||[]).length} | Found for manual: ${(report.manualApply||[]).length} | Errors: ${(report.errors||[]).length}`, 'success');

        // ── Bring dashboard to front and highlight the report ──────────────
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          broadcast('agent:run-complete', { stats: newStats });
        }
      } catch (e) {
        broadcast('agent:log', { time: new Date().toISOString(), message: `❌ Agent error: ${e.message}`, type: 'error' });
      } finally {
        agentRunning = false;
        tray.setRunning(false);
        broadcast('agent:status', { running: false });
        floatingWindow.hide();   // hide the control bar once the run is fully done
      }
    })();

    return { started: true };
  });

  ipcMain.handle('app:stop-agent', () => {
    agentRunning = false;
    agentPaused  = false;
    return { stopped: true };
  });

  // ── Emergency Force Stop ─────────────────────────────────────────────────
  // Used when the agent appears stuck (e.g., Chrome closed unexpectedly and
  // didn't clean up). Forcibly closes the browser context and resets all
  // state, then returns the dashboard to a usable Idle state regardless of
  // what the in-flight run was doing.
  ipcMain.handle('app:force-stop-agent', async () => {
    agentState.setStopped(true);
    agentPaused = false;
    agentState.setPaused(false);
    await agentState.forceCloseBrowser();
    agentRunning = false;
    const tray = require('./tray');
    tray.setRunning(false);
    broadcast('agent:status', { running: false });
    broadcast('agent:log', { time: new Date().toISOString(), message: '🛑 Agent force-stopped by user.', type: 'warning' });
    floatingWindow.hide();
    return { stopped: true };
  });

  // ── Pause / Resume ────────────────────────────────────────────────────────
  ipcMain.handle('app:pause-agent', () => {
    if (!agentRunning) return { error: 'Agent not running' };
    agentPaused = true;
    agentState.setPaused(true);
    broadcast('agent:status', { running: true, paused: true });
    broadcast('agent:log', {
      time: new Date().toISOString(),
      message: '⏸️  Agent PAUSED — you can edit values in Chrome. Click Resume when ready.',
      type: 'warning'
    });
    return { paused: true };
  });

  ipcMain.handle('app:resume-agent', () => {
    agentPaused = false;
    agentState.setPaused(false);
    broadcast('agent:status', { running: true, paused: false });
    broadcast('agent:log', {
      time: new Date().toISOString(),
      message: '▶️  Agent RESUMED',
      type: 'success'
    });
    return { resumed: true };
  });

  // ── Skip current job ─────────────────────────────────────────────────────
  // Aborts only the job currently being applied to, then continues normally
  // to the next one — distinct from Pause (which halts everything) and Force
  // Stop (which kills the whole run).
  ipcMain.handle('app:skip-job', () => {
    if (!agentRunning) return { error: 'Agent not running' };
    agentState.requestSkip();
    broadcast('agent:log', {
      time: new Date().toISOString(),
      message: '⏭️  Skipping current job…',
      type: 'warning'
    });
    return { skipping: true };
  });

  ipcMain.handle('app:is-paused', () => agentPaused);

  ipcMain.handle('app:get-agent-status', () => ({
    running: agentRunning,
    paused:  agentPaused,
    nextRun: sched.getNextRunLabel()
  }));

  // app:sign-off and app:logout are registered above in the user management section

  ipcMain.handle('app:focus-chrome', () => {
    require('./window-focus').focusChrome();
    return true;
  });

  ipcMain.handle('app:get-logs',        () => logHistory);
  // Self-learning question bank is PRIVATE per user — see linkedin.js where
  // it's read/written via the active user's own store, never the global one.
  ipcMain.handle('app:get-question-bank-count', () => activeStore().get('questionBank', []).length);
  ipcMain.handle('app:get-question-bank',       () => activeStore().get('questionBank', []));
  ipcMain.handle('app:get-last-report', () => {
    const s = activeStore();
    const cs = s.get('cumulativeStats', { totalApplied: 0, totalSkipped: 0, totalErrors: 0, allAppliedJobs: [], manualApplyJobs: [] });
    return {
      ...( s.get('lastReport', {}) || {} ),
      cumulativeStats: cs,
      manualApply: cs.manualApplyJobs || []   // include for dashboard grid
    };
  });

  // ── Report download (CSV / XLS / PDF) ─────────────────────────────────────
  ipcMain.handle('app:download-report', async (_, { format, content, filename, htmlContent }) => {
    const { dialog, BrowserWindow } = require('electron');
    const fs   = require('fs');
    const path = require('path');
    const win  = BrowserWindow.getFocusedWindow() || mainWindow;

    const filters = {
      csv: [{ name: 'CSV File',   extensions: ['csv'] }],
      xls: [{ name: 'Excel File', extensions: ['xls'] }],
      pdf: [{ name: 'PDF File',   extensions: ['pdf'] }]
    };

    if (format === 'pdf') {
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Report as PDF',
        defaultPath: filename || 'nexora-applied-jobs.pdf',
        filters: filters.pdf
      });
      if (!filePath) return { saved: false };

      // Create a hidden window, load the styled HTML table, then print to PDF
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent || content || ''));
      await new Promise(r => setTimeout(r, 600)); // let styles render
      const pdfData = await pdfWin.webContents.printToPDF({
        landscape: true,
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      });
      pdfWin.destroy();
      fs.writeFileSync(filePath, pdfData);
      return { saved: true, path: filePath };
    }

    // CSV / XLS — write text content directly
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Report',
      defaultPath: filename || `nexora-applied-jobs.${format}`,
      filters: filters[format] || filters.csv
    });
    if (!filePath) return { saved: false };
    fs.writeFileSync(filePath, content, 'utf8');
    return { saved: true, path: filePath };
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:get-settings', () => ({
    schedule: store.get('schedule', {}),
    app:      store.get('app', {})
  }));

  ipcMain.handle('app:save-settings', (_, data) => {
    if (data.schedule) { store.set('schedule', data.schedule); sched.applySchedule(); }
    if (data.app)       store.set('app', data.app);
    return { saved: true };
  });

  // ── License ───────────────────────────────────────────────────────────────
  ipcMain.handle('app:get-license',     ()    => lic.getLicenseInfo());
  ipcMain.handle('app:activate-license', (_, key) => lic.activateKey(key));
}

module.exports = { register, togglePauseFromShortcut };
