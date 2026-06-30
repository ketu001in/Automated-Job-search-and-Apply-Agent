/**
 * user-store.js — Tracks the active user's per-user electron-store.
 * Shared between ipc-handlers.js (sets it on login/logout) and linkedin.js /
 * scheduler.js (reads it so the agent always uses the CURRENTLY logged-in
 * user's profile, preferences, and applied-job history — never stale/global data).
 */

const fs    = require('fs');
const path  = require('path');
const Store = require('electron-store');
const { app } = require('electron');
const globalStore = require('./store');

let _userStore = null;

function getUserStore(userId) {
  const userDir = path.join(app.getPath('userData'), 'users', userId);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  return new Store({
    name:          'profile',
    cwd:           userDir,
    encryptionKey: 'bosket-nexora-user-v1'
  });
}

function setActiveUserStore(userId) {
  _userStore = userId ? getUserStore(userId) : null;
  return _userStore;
}

function clearActiveUserStore() {
  _userStore = null;
}

function activeStore() {
  return _userStore || globalStore;
}

// ── Single source of truth for "log this user in" ───────────────────────────
// Used by BOTH the login screen (ipc-handlers.js) and the startup auto-login
// shortcut (main.js) so the per-user store is ALWAYS activated consistently.
// Previously main.js's auto-login bypassed store activation entirely, causing
// the agent to silently keep reading stale/global preferences after every
// normal app launch.
function activateUserSession(userId) {
  const users = require('./users');
  const u = users.loginUser(userId);
  if (!u) return null;
  users.setActiveUser(u);
  const us = setActiveUserStore(userId);

  // One-time migration: if user store is empty, copy from global store —
  // but ONLY for the user who actually owns that global data (matched by
  // LinkedIn email). A brand-new, different user must never inherit someone
  // else's profile or learned answers.
  const isEmpty = !us.get('personal') && !us.get('linkedin');
  if (isEmpty) {
    const globalLinkedin = globalStore.get('linkedin', {});
    const globalEmail    = globalLinkedin.email || '';
    if (globalEmail && globalEmail.toLowerCase() === (u.email || '').toLowerCase()) {
      ['linkedin','jobSearchStatus','profileCategory','personal','address',
       'education','experience','preferences','cv','schedule','setupCompleted'
      ].forEach(key => {
        const val = globalStore.get(key);
        if (val !== undefined) us.set(key, val);
      });

      // The self-learning question bank used to be shared globally across all
      // users. Per explicit feedback, it must be PRIVATE per user — one
      // person's learned answers (which can include their own profile values
      // like CTC) must never leak into a different user's applications. Only
      // the legitimate original owner (matched above by email) recovers their
      // already-learned bank; any other, different new user starts empty.
      if (!us.get('questionBank')) {
        const globalBank = globalStore.get('questionBank', []);
        if (globalBank.length) us.set('questionBank', globalBank);
      }
    }
  }

  return u;
}

module.exports = { getUserStore, setActiveUserStore, clearActiveUserStore, activeStore, activateUserSession };
