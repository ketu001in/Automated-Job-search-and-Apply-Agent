/**
 * users.js — Multi-user profile management for Nexora.
 *
 * Each user is identified by their LinkedIn email.
 * Each gets completely isolated:
 *   - Profile data, CV, preferences, job history
 *   - Browser session (separate Chromium profile directory)
 *
 * No passwords required for a local tool — profile card selection is sufficient.
 * Optional PIN can be added in v2.
 *
 * Publisher: Bosket's Tech Ventures
 */

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

let _app = null;

function getApp() {
  if (!_app) _app = require('electron').app;
  return _app;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function getUsersDir()          { return path.join(getApp().getPath('userData'), 'users'); }
function getUsersIndexPath()    { return path.join(getUsersDir(), 'index.json'); }
function getUserDir(userId)     { return path.join(getUsersDir(), userId); }
function getUserDataPath(userId){ return path.join(getUserDir(userId), 'profile.json'); }
function getBrowserProfileDir(userId) {
  return path.join(getUserDir(userId), 'browser-profile');
}

function hashEmail(email) {
  return crypto.createHash('md5').update((email || '').toLowerCase().trim()).digest('hex').slice(0, 12);
}

// ── Index (list of all local users) ──────────────────────────────────────────

function loadIndex() {
  const p = getUsersIndexPath();
  if (!fs.existsSync(p)) return { users: [], lastUserId: null };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { users: [], lastUserId: null }; }
}

function saveIndex(idx) {
  const dir = getUsersDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getUsersIndexPath(), JSON.stringify(idx, null, 2));
}

// ── User profile data ─────────────────────────────────────────────────────────

function loadUserData(userId) {
  const p = getUserDataPath(userId);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveUserData(userId, data) {
  const dir = getUserDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getUserDataPath(userId), JSON.stringify(data, null, 2));
}

// ── Public API ────────────────────────────────────────────────────────────────

function getAllUsers() {
  return loadIndex().users || [];
}

function getLastUserId() {
  return loadIndex().lastUserId || null;
}

function findUserByEmail(email) {
  if (!email) return null;
  const userId = hashEmail(email);
  const idx    = loadIndex();
  return (idx.users || []).find(u => u.id === userId) || null;
}

function createUser({ name, email }) {
  const userId = hashEmail(email);
  const idx    = loadIndex();

  // Don't duplicate
  const existing = (idx.users || []).find(u => u.id === userId);
  if (existing) return existing;

  const user = {
    id:        userId,
    name:      (name || email.split('@')[0]),
    email:     email.toLowerCase().trim(),
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  idx.users = idx.users || [];
  idx.users.unshift(user);
  saveIndex(idx);

  // Create browser profile dir immediately so it's ready
  const bpDir = getBrowserProfileDir(userId);
  if (!fs.existsSync(bpDir)) fs.mkdirSync(bpDir, { recursive: true });

  return user;
}

function loginUser(userId) {
  const idx = loadIndex();
  const user = (idx.users || []).find(u => u.id === userId);
  if (!user) return null;
  user.lastLogin = new Date().toISOString();
  idx.lastUserId = userId;
  saveIndex(idx);
  return user;
}

function updateUser(userId, updates) {
  const idx  = loadIndex();
  const user = (idx.users || []).find(u => u.id === userId);
  if (!user) return;
  Object.assign(user, updates);
  saveIndex(idx);
}

function getUserProfile(userId)           { return loadUserData(userId); }
function saveUserProfile(userId, data)    { saveUserData(userId, data); }
function getUserBrowserDir(userId)        { return getBrowserProfileDir(userId); }

// ── Active user (in-memory for current session) ───────────────────────────────

let _activeUser = null;

function setActiveUser(user)  { _activeUser = user; }
function getActiveUser()      { return _activeUser; }
function getActiveUserId()    { return _activeUser ? _activeUser.id : null; }

module.exports = {
  getAllUsers, getLastUserId, findUserByEmail,
  createUser, loginUser, updateUser,
  getUserProfile, saveUserProfile,
  getUserBrowserDir, getBrowserProfileDir: (id) => getBrowserProfileDir(id),
  hashEmail,
  setActiveUser, getActiveUser, getActiveUserId
};
