/**
 * store.js — Persistent configuration store for Nexora.
 * Publisher: Bosket's Tech Ventures
 * All user profile, preferences, credentials and app settings live here.
 */

const Store = require('electron-store');

const schema = {
  // ── App meta ──────────────────────────────────────────────────────────────
  setupCompleted: { type: 'boolean', default: false },
  appVersion:     { type: 'string',  default: '1.0.0' },

  // ── LinkedIn credentials ──────────────────────────────────────────────────
  linkedin: {
    type: 'object',
    default: {},
    properties: {
      email:    { type: 'string', default: '' },
      password: { type: 'string', default: '' }
    }
  },

  // ── Job search status (informational only) ────────────────────────────────
  jobSearchStatus: {
    type: 'string',
    default: 'actively-searching'
  },

  // ── Profile category: IT (tech) or Non-IT (non-tech) ─────────────────────
  // Drives which job titles Nexora searches and assesses.
  // Auto-detected from CV on upload; user can override in My Profile.
  profileCategory: {
    type: 'string',
    default: 'tech'
  },

  // ── Personal details ──────────────────────────────────────────────────────
  personal: {
    type: 'object',
    default: {},
    properties: {
      firstName:        { type: 'string', default: '' },
      lastName:         { type: 'string', default: '' },
      email:            { type: 'string', default: '' },
      phone:            { type: 'string', default: '' },
      phoneCountryCode: { type: 'string', default: '+91' },
      linkedinUrl:      { type: 'string', default: '' },
      portfolioUrl:     { type: 'string', default: '' }
    }
  },

  // ── Address ───────────────────────────────────────────────────────────────
  address: {
    type: 'object',
    default: {},
    properties: {
      line1:   { type: 'string', default: '' },
      line2:   { type: 'string', default: '' },
      city:    { type: 'string', default: '' },
      state:   { type: 'string', default: '' },
      country: { type: 'string', default: '' },
      pincode: { type: 'string', default: '' }
    }
  },

  // ── Education (array) ─────────────────────────────────────────────────────
  education: {
    type: 'array',
    default: [],
    items: {
      type: 'object',
      properties: {
        institution: { type: 'string' },
        degree:      { type: 'string' },
        field:       { type: 'string' },
        startYear:   { type: 'string' },
        endYear:     { type: 'string' },
        grade:       { type: 'string' },
        gradeType:   { type: 'string' }
      }
    }
  },

  // ── Work experience (array) ───────────────────────────────────────────────
  experience: {
    type: 'array',
    default: [],
    items: {
      type: 'object',
      properties: {
        company:     { type: 'string' },
        title:       { type: 'string' },
        startMonth:  { type: 'string' },
        startYear:   { type: 'string' },
        endMonth:    { type: 'string' },
        endYear:     { type: 'string' },
        isCurrent:   { type: 'boolean' },
        description: { type: 'string' }
      }
    }
  },

  // ── Job preferences ───────────────────────────────────────────────────────
  preferences: {
    type: 'object',
    default: {},
    properties: {
      targetRoles:            { type: 'array',   default: [], items: { type: 'string' } },
      locations:              { type: 'array',   default: [], items: { type: 'string' } },
      experienceYears:        { type: 'number',  default: 0 },
      experienceMonths:       { type: 'number',  default: 0 },
      noticePeriodValue:      { type: 'number',  default: 0 },
      noticePeriodUnit:       { type: 'string',  default: 'days' },
      noticePeriodNegotiable: { type: 'boolean', default: false },
      joiningAvailability:    { type: 'string',  default: '' },
      willingToTravel:        { type: 'boolean', default: false },
      travelPercentage:       { type: 'number',  default: 25 },
      currentCTC:             { type: 'number',  default: 0 },
      expectedCTC:            { type: 'number',  default: 0 },
      ctcUnit:                { type: 'string',  default: 'LPA' }
    }
  },

  // ── CV raw data ───────────────────────────────────────────────────────────
  cv: {
    type: 'object',
    default: {},
    properties: {
      filename:    { type: 'string', default: '' },
      uploadedAt:  { type: 'string', default: '' },
      rawText:     { type: 'string', default: '' },
      portfolioUrl:{ type: 'string', default: '' },
      skills:      { type: 'array',  default: [], items: { type: 'string' } }
    }
  },

  // ── Automation schedule ───────────────────────────────────────────────────
  schedule: {
    type: 'object',
    default: {},
    properties: {
      enabled:    { type: 'boolean', default: false },
      frequency:  { type: 'string',  default: 'daily' },
      time:       { type: 'string',  default: '10:00' },
      dayOfWeek:  { type: 'number',  default: 1 },
      dayOfMonth: { type: 'number',  default: 1 }
    }
  },

  // ── License (dormant for v1–v3) ───────────────────────────────────────────
  license: {
    type: 'object',
    default: {},
    properties: {
      type:        { type: 'string', default: 'free' },
      key:         { type: 'string', default: '' },
      validUntil:  { type: 'string', default: '' },
      activatedAt: { type: 'string', default: '' }
    }
  },

  // ── Self-learning question bank (grows with every successful application) ─
  questionBank: {
    type: 'array',
    default: [],
    items: { type: 'object' }
  },

  // ── Cumulative run stats (accumulates across all runs, never resets) ───────
  cumulativeStats: {
    type: 'object',
    default: { totalApplied: 0, totalSkipped: 0, totalErrors: 0, allAppliedJobs: [] }
  },

  // ── App settings ──────────────────────────────────────────────────────────
  app: {
    type: 'object',
    default: {},
    properties: {
      minimizeToTray:        { type: 'boolean', default: true },
      startOnLogin:          { type: 'boolean', default: false },
      headless:              { type: 'boolean', default: false },
      maxApplicationsPerRun: { type: 'number',  default: 20 },
      minCompatibilityScore: { type: 'number',  default: 3 },
      searchTimeFilter:      { type: 'string',  default: 'r259200' }  // 3 days
    }
  }
};

const store = new Store({
  name: 'nexora-config',
  schema,
  encryptionKey: 'bosket-nexora-v1-cfg-2025'
});

module.exports = store;
