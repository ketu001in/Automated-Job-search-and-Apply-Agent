/**
 * setup-browser.js
 * Downloads the Playwright Chromium browser required by Nexora.
 * Run once after installation: npm run setup-browser
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  NEXORA — Setting up Chromium browser                   ║');
console.log('║  by Bosket\'s Tech Ventures                              ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');
console.log('Downloading Chromium browser (~170 MB). This takes 1-3 minutes');
console.log('depending on your internet speed. Please wait...');
console.log('');

try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    timeout: 300000 // 5 min timeout
  });
  console.log('');
  console.log('✅ Chromium installed successfully!');
  console.log('   Nexora is ready to use.');
  console.log('');
} catch (err) {
  console.error('');
  console.error('❌ Browser download failed:', err.message);
  console.error('   Nexora will attempt to download it automatically on first launch.');
  console.error('   Ensure you have an internet connection.');
  console.error('');
  process.exit(0); // Don't fail — app handles it on first run
}
