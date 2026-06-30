/**
 * help.js — Shared F1 context-help handler.
 * Include on every Nexora screen: pressing F1 opens the documentation page
 * scrolled to whichever topic matches the screen currently in view.
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault();
    if (window.api && window.api.openHelp) window.api.openHelp();
  }
});
