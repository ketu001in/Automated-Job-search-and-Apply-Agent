/**
 * license.js — License management scaffold.
 *
 * v1–v3: FREE. isValid() always returns true. Key is ignored.
 * v4+:   Flip PAID_REQUIRED = true, implement validateKey() against your backend.
 *
 * Architecture is ready; activation is a single config change.
 */

const store = require('./store');

const APP_VERSION   = '1.0.0';
const FREE_VERSIONS = ['1', '2', '3'];     // major versions that are always free
const PAID_REQUIRED = false;               // ← flip to true for v4+

// ── Public API ────────────────────────────────────────────────────────────────

function getLicenseInfo() {
  const lic = store.get('license') || {};
  const major = APP_VERSION.split('.')[0];
  const isFreeVersion = FREE_VERSIONS.includes(major) || !PAID_REQUIRED;

  return {
    appVersion:    APP_VERSION,
    licenseType:   isFreeVersion ? 'free' : (lic.type || 'free'),
    key:           lic.key || '',
    validUntil:    lic.validUntil || '',
    activatedAt:   lic.activatedAt || '',
    isValid:       isValid(),
    isFreeVersion,
    paidRequired:  PAID_REQUIRED
  };
}

function isValid() {
  const major = APP_VERSION.split('.')[0];
  if (FREE_VERSIONS.includes(major) || !PAID_REQUIRED) return true;

  // Paid version check
  const lic = store.get('license') || {};
  if (!lic.key) return false;
  if (lic.validUntil && new Date(lic.validUntil) < new Date()) return false;
  return lic.type === 'paid';
}

async function activateKey(key) {
  if (!PAID_REQUIRED) {
    return { success: true, message: 'This version is free — no key needed.' };
  }
  // TODO (v4+): POST key to your validation endpoint
  // const response = await fetch('https://api.bosketstechventures.com/license/validate', {
  //   method: 'POST', body: JSON.stringify({ key, version: APP_VERSION })
  // });
  // const result = await response.json();
  // if (result.valid) { store.set('license', { type:'paid', key, validUntil: result.validUntil, activatedAt: new Date().toISOString() }); }
  return { success: false, message: 'Paid activation not yet available. Stay tuned for v4+!' };
}

module.exports = { getLicenseInfo, isValid, activateKey };
