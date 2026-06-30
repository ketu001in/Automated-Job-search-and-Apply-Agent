/**
 * scheduler.js — node-cron based job scheduler.
 * Builds cron expression from user's simple preset (daily/weekly/monthly + time).
 */

const cron = require('node-cron');
const store = require('./store');

let cronJob  = null;
let mainWin  = null;

function init(window) {
  mainWin = window;
  applySchedule();

  // Re-apply whenever settings change
  store.onDidChange('schedule', () => applySchedule());
}

function applySchedule() {
  if (cronJob) { cronJob.stop(); cronJob = null; }

  const sched = store.get('schedule') || {};
  if (!sched.enabled) return;

  const expr = buildCronExpression(sched);
  if (!expr) return;

  try {
    cronJob = cron.schedule(expr, () => {
      if (mainWin) mainWin.webContents.send('schedule:fired', { time: new Date().toISOString() });
      triggerAgent();
    }, { timezone: 'Asia/Kolkata' });

    console.log(`[Scheduler] Scheduled: ${expr} IST`);
  } catch (e) {
    console.error('[Scheduler] Invalid cron expression:', expr, e.message);
  }
}

function buildCronExpression(sched) {
  const [hour, minute] = (sched.time || '10:00').split(':').map(Number);

  switch (sched.frequency) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${sched.dayOfWeek ?? 1}`;
    case 'monthly':
      return `${minute} ${hour} ${sched.dayOfMonth ?? 1} * *`;
    default:
      return null;
  }
}

function getNextRunLabel() {
  const sched = store.get('schedule') || {};
  if (!sched.enabled) return 'Scheduler disabled';

  const [hour, minute] = (sched.time || '10:00').split(':').map(Number);
  const now  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute);

  if (sched.frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (sched.frequency === 'weekly') {
    const dow = sched.dayOfWeek ?? 1;
    next.setDate(next.getDate() + ((dow + 7 - next.getDay()) % 7 || 7));
  } else if (sched.frequency === 'monthly') {
    next.setDate(sched.dayOfMonth ?? 1);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

async function triggerAgent() {
  try {
    const { runLinkedInAgent } = require('../agent/linkedin');
    const log = (msg, type) => {
      if (mainWin) mainWin.webContents.send('agent:log', { time: new Date().toISOString(), message: msg, type: type || 'info' });
    };
    if (mainWin) mainWin.webContents.send('agent:status', { running: true, triggeredBy: 'scheduled' });
    const report = await runLinkedInAgent(log);
    if (mainWin) {
      mainWin.webContents.send('agent:report', { ...report, triggeredBy: 'scheduled' });
      mainWin.webContents.send('agent:status', { running: false });
    }
  } catch (e) {
    console.error('[Scheduler] Agent error:', e.message);
    if (mainWin) mainWin.webContents.send('agent:status', { running: false, error: e.message });
  }
}

function stop() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}

module.exports = { init, applySchedule, getNextRunLabel, stop };
