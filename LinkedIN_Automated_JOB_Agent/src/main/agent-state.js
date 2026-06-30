/**
 * agent-state.js — Shared mutable state for the running agent.
 * Allows ipc-handlers.js to set pause/stop flags that linkedin.js can read
 * without creating circular dependencies.
 */

let _paused  = false;
let _stopped = false;
let _context = null;   // reference to the live Playwright browser context, if any
let _skip    = false;  // user requested skipping the CURRENT job being applied to

module.exports = {
  setPaused:  (v) => { _paused  = v; },
  isStopped:  ()  => _stopped,
  isPaused:   ()  => _paused,
  setStopped: (v) => { _stopped = v; },
  setContext: (c) => { _context = c; },
  getContext: ()  => _context,
  requestSkip:    () => { _skip = true; },
  isSkipRequested:() => _skip,
  clearSkipRequest:() => { _skip = false; },
  // Forcibly close the browser if the agent is stuck — used by the
  // emergency Stop button when Pause/Resume isn't enough to recover.
  forceCloseBrowser: async () => {
    if (_context) {
      try { await _context.close(); } catch {}
    }
    _context = null;
  },
  reset:      ()  => { _paused = false; _stopped = false; _context = null; _skip = false; }
};
