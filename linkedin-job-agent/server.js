/**
 * server.js
 * Express + Socket.io web server with:
 *   - Real-time dashboard
 *   - Manual "Run Now" trigger
 *   - node-cron scheduler (10 AM IST daily)
 *   - Session save endpoint
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { runLinkedInAgent } = require('./linkedin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── State ────────────────────────────────────────────────────────────────────

let isRunning = false;
let lastReport = null;
const logHistory = []; // keep last 500 lines

function log(message, type = 'info') {
  const entry = { time: new Date().toISOString(), message, type };
  console.log(`[${type.toUpperCase()}] ${message}`);
  logHistory.push(entry);
  if (logHistory.length > 500) logHistory.shift();
  io.emit('log', entry);
}

// ─── Agent Runner ─────────────────────────────────────────────────────────────

async function startRun(triggeredBy = 'manual') {
  if (isRunning) {
    log('⚠️  Run already in progress — skipping', 'warning');
    return;
  }
  isRunning = true;
  io.emit('status', { running: true, triggeredBy, startTime: new Date().toISOString() });
  log(`🚀 Agent started (trigger: ${triggeredBy})`, 'info');

  try {
    const report = await runLinkedInAgent(log);
    lastReport = { ...report, triggeredBy };
    io.emit('report', lastReport);
    log(`✅ Run complete — Applied: ${report.applied.length} | Skipped: ${report.skipped.length} | Errors: ${report.errors.length}`, 'success');

    // Persist report
    const reportPath = path.join(__dirname, 'last_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(lastReport, null, 2));
  } catch (err) {
    log(`❌ Agent error: ${err.message}`, 'error');
    lastReport = { error: err.message, timestamp: new Date().toISOString(), triggeredBy };
    io.emit('report', lastReport);
  } finally {
    isRunning = false;
    io.emit('status', { running: false });
  }
}

// ─── Scheduler: 10 AM IST (UTC+5:30 = 04:30 UTC) ────────────────────────────

const cronExpression = process.env.CRON_SCHEDULE || '0 10 * * *';
cron.schedule(cronExpression, () => {
  log('⏰ Scheduled trigger fired', 'info');
  startRun('scheduled');
}, { timezone: 'Asia/Kolkata' });

log(`📅 Scheduled to run at: ${cronExpression} IST`, 'info');

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    running: isRunning,
    lastReport,
    schedule: cronExpression,
    nextRun: getNextRunLabel()
  });
});

app.post('/api/run', (req, res) => {
  if (isRunning) return res.json({ error: 'Already running' });
  res.json({ started: true });
  startRun('manual');
});

app.get('/api/logs', (req, res) => {
  res.json(logHistory);
});

app.get('/api/report', (req, res) => {
  // Try persisted report if in-memory is null
  if (!lastReport) {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'last_report.json'), 'utf8'));
      return res.json(saved);
    } catch { /* no saved report */ }
  }
  res.json(lastReport || {});
});

// Save LinkedIn session cookies (for manual-login flow)
app.post('/api/save-session', (req, res) => {
  const { cookies } = req.body;
  if (!cookies || !Array.isArray(cookies)) return res.status(400).json({ error: 'No cookies provided' });
  fs.writeFileSync(path.join(__dirname, 'linkedin_session.json'), JSON.stringify(cookies, null, 2));
  res.json({ saved: true });
});

app.get('/api/session-status', (req, res) => {
  const exists = fs.existsSync(path.join(__dirname, 'linkedin_session.json'));
  res.json({ hasSavedSession: exists });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // Send history to new connections
  socket.emit('history', logHistory);
  socket.emit('status', { running: isRunning });
  if (lastReport) socket.emit('report', lastReport);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 LinkedIn Job Agent dashboard: http://localhost:${PORT}`);
  console.log(`   (on your local network: http://<your-laptop-IP>:${PORT})\n`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextRunLabel() {
  // Simple: always say "Today / Tomorrow at 10:00 AM IST"
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const next = new Date(ist);
  next.setHours(10, 0, 0, 0);
  if (next <= ist) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}
