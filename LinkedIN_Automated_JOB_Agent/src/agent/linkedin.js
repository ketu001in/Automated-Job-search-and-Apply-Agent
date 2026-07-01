/**
 * linkedin.js — Playwright-based LinkedIn automation for Your Career Buddy.
 * Uses profile data from electron-store via form-filler for intelligent form filling.
 */

const { chromium } = require('playwright');
const fs   = require('path');
const path = require('path');
const store       = require('../main/store');   // global app-wide settings only
const userStore   = require('../main/user-store'); // active user's profile/preferences/stats
const formFiller  = require('./form-filler');
const agentState  = require('../main/agent-state');

// Per-user persistent browser profile — each LinkedIn account gets its own session.
// When credentials change, a different profile dir is used → fresh Chrome → no contamination.
function getBrowserProfileDir() {
  try {
    const usersModule = require('../main/users');
    const activeUser  = usersModule.getActiveUser();
    if (activeUser) {
      // Per-user browser profile: sessions are 100% isolated per LinkedIn account
      return usersModule.getUserBrowserDir(activeUser.id);
    }
    // Fallback to generic profile if no user logged in
    return path.join(require('electron').app.getPath('userData'), 'browser-profile');
  } catch {
    return path.join(require('os').homedir(), '.nexora', 'browser-profile');
  }
}

// Session is now handled automatically by the persistent browser profile.
// These stubs are kept to avoid breaking any callers.

async function saveCookies() { /* handled by persistent profile */ }
async function loadCookies()  { return true; /* always "has cookies" with persistent profile */
}

// ── Main Agent ────────────────────────────────────────────────────────────────

async function runLinkedInAgent(log) {
  // CRITICAL: Always read from the CURRENTLY logged-in user's store, not the
  // global store. Without this, the agent applies with whichever user's data
  // happened to be in the global store last — ignoring profile updates made
  // by the user who is actually logged in right now.
  const s = userStore.activeStore();

  // Load full profile into form-filler
  const profile = {
    linkedin:    s.get('linkedin',    {}),
    personal:    s.get('personal',    {}),
    address:     s.get('address',     {}),
    education:   s.get('education',   []),
    experience:  s.get('experience',  []),
    preferences: s.get('preferences', {}),
    cv:          s.get('cv',          {})
  };
  formFiller.setProfile(profile);
  // Load THIS USER's question bank — private per user, never shared. One
  // person's learned answers (which can include their own profile values)
  // must never leak into a different user's applications.
  formFiller.loadQuestionBank(s.get('questionBank', []));

  const appSettings  = store.get('app', {});    // app-wide settings stay global
  const HEADLESS     = appSettings.headless !== false;
  const MAX_APPS       = appSettings.maxApplicationsPerRun || 20;
  const MIN_SCORE      = appSettings.minCompatibilityScore || 3;
  const pref           = profile.preferences || {};
  const profileCategory = s.get('profileCategory', 'tech'); // 'tech' or 'non-tech' — per user

  // Build set of jobIds already applied in past runs (any run, not just this session)
  // so we never re-apply even if LinkedIn's own "Applied" badge fails to render.
  const cumulativeStats = s.get('cumulativeStats', { allAppliedJobs: [] });
  const previouslyAppliedIds = new Set((cumulativeStats.allAppliedJobs || []).map(j => j.jobId));

  // Default search roles differ by category
  const DEFAULT_TECH_ROLES    = ['Program Manager', 'Technical Program Manager', 'PMO'];
  const DEFAULT_NONTECH_ROLES = ['Operations Manager', 'Project Manager', 'Business Analyst'];
  const defaultRoles = profileCategory === 'tech' ? DEFAULT_TECH_ROLES : DEFAULT_NONTECH_ROLES;
  const targetRoles  = (pref.targetRoles || []).length ? pref.targetRoles : defaultRoles;

  log(`🔖 Profile Category: ${profileCategory.toUpperCase()} · Searching ${targetRoles.length} role(s)`, 'info');

  log('🚀 Launching browser...', 'info');

  // Use a PERSISTENT browser profile so LinkedIn session cookies survive between runs.
  // This means: login + 2FA only happens ONCE. All subsequent runs reuse the saved session.
  const profileDir = getBrowserProfileDir();
  const fsp = require('fs');
  if (!fsp.existsSync(profileDir)) fsp.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: HEADLESS,
    slowMo:   HEADLESS ? 0 : 100,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 800 },
    locale:    'en-IN',
    extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-extensions',
      '--window-size=1280,800'
    ]
  });

  // Register this context so the emergency "Stop" control can force-close it,
  // and detect if the USER manually closes the Chrome window — without this,
  // Playwright calls on a closed context just hang/error without the agent
  // ever cleanly exiting, leaving the floating control bar stuck on screen.
  agentState.setContext(context);
  let chromeClosedExternally = false;
  context.on('close', () => {
    chromeClosedExternally = true;
    agentState.setStopped(true);   // also signal globally so pause-wait/modal loops exit cleanly
  });

  // Stealth scripts — hide Playwright fingerprint from LinkedIn bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
  });

  log('   Browser ready (persistent profile)', 'info');

  // Handle leftover tabs from the previous session.
  // Closing ALL pages shuts down Chrome entirely — keep one and close the rest.
  const existingPages = context.pages();
  let page;
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (let i = 1; i < existingPages.length; i++) {
      try { await existingPages[i].close(); } catch {}
    }
    await page.goto('about:blank', { waitUntil: 'commit' }).catch(() => {});
  } else {
    page = await context.newPage();
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const isLoggedIn = await checkLoggedIn(page);
    if (!isLoggedIn) {
      const email    = profile.linkedin.email;
      const password = profile.linkedin.password;

      if (email && password) {
        log('🔐 Logging in with saved credentials...', 'info');
        await loginWithCredentials(page, email, password, log);
      } else {
        log('⚠️  LinkedIn session expired or no credentials. Opening browser for manual login.', 'warning');

        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        log('👉 Please log in to LinkedIn in the browser window (waiting up to 5 min)...', 'info');
        await page.waitForURL('**/feed/**', { timeout: 300000 });
      }
    }
  } catch (err) {
    log(`❌ Login error: ${err.message}`, 'error');
    await context.close();
    return { applied: [], skipped: [], errors: [`Login failed: ${err.message}`] };
  }

  await saveCookies(context);
  log('✅ Logged in to LinkedIn', 'success');

  const applied     = [];
  const skipped     = [];
  const errors      = [];
  const manualApply = [];   // matched jobs without Easy Apply — shown in dashboard for manual action
  const seenJobIds  = new Set();

  // Load configurable time filter from settings
  const TIME_FILTER = appSettings.searchTimeFilter || 'r259200'; // default: 3 days

  // Everything from here on is wrapped so the function ALWAYS resolves with a
  // valid report — even if Chrome is closed mid-run or an unexpected error
  // occurs. Without this, an uncaught error could leave the floating control
  // bar and dashboard stuck waiting forever for a promise that never settles.
  try {

  // ── Search Loop ────────────────────────────────────────────────────────────
  searchLoop:
  for (const query of targetRoles) {
    if (chromeClosedExternally || agentState.isStopped()) { log('🛑 Chrome closed — stopping agent.', 'warning'); break; }
    if (applied.length >= MAX_APPS) { log(`📊 Reached max ${MAX_APPS} applications. Stopping.`, 'info'); break; }
    log(`\n🔍 Searching: "${query}"`, 'info');

    const locationParam = (pref.locations || ['India'])[0];
    // NOTE: f_LF=f_AL (LinkedIn's own "Easy Apply only" filter) is intentionally
    // OMITTED here. With it, LinkedIn pre-filters out every job without Easy
    // Apply before the agent ever sees it — making the "Found More Jobs" manual
    // apply grid permanently empty. We now fetch ALL matching jobs and let the
    // agent itself decide: Easy Apply → auto-apply, no Easy Apply → manual list.
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(locationParam)}&f_TPR=${TIME_FILTER}&sortBy=DD`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } catch (err) {
      log(`⚠️  Could not load search page: ${err.message}`, 'warning');
      continue;
    }

    const jobIds = await collectJobIds(page);
    log(`Found ${jobIds.length} jobs for "${query}"`, 'info');

    for (const jobId of jobIds) {
      if (chromeClosedExternally || agentState.isStopped()) { log('🛑 Chrome closed — stopping agent.', 'warning'); break searchLoop; }
      if (applied.length >= MAX_APPS) break;
      if (seenJobIds.has(jobId)) continue;
      seenJobIds.add(jobId);

      // ── Pause check BEFORE starting this job ────────────────────────────
      // Without this, pausing only ever took effect AFTER a job finished
      // applying (which could be a long time away if the agent was mid-scan
      // or mid-fill) — this made Pause feel broken. Checking here too means
      // pausing engages within seconds, not after the current job completes.
      if (agentState.isPaused()) {
        log('⏸️  Agent paused. Edit values in Chrome, then click Resume.', 'warning');
        await waitForResume();
        if (agentState.isStopped()) { log('🛑 Stopped while paused.', 'warning'); break searchLoop; }
        log('▶️  Resumed.', 'success');
      }

      try {
        const jobUrl = `${url}&currentJobId=${jobId}`;
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        const jobTitle   = await extractText(page, ['.job-details-jobs-unified-top-card__job-title h1', '.jobs-unified-top-card__job-title h1', 'h1.t-24', 'h1']);
        const company    = await extractText(page, ['.job-details-jobs-unified-top-card__company-name a', '.jobs-unified-top-card__company-name a', '.topcard__org-name-link']);
        const description= await extractText(page, ['.jobs-description-content__text', '.jobs-description__content', '#job-details']);

        const displayTitle   = jobTitle.trim()  || `Job ${jobId}`;
        const displayCompany = company.trim()   || 'Unknown company';

        // Already applied? Check both LinkedIn's own UI badge AND our local history
        // (LinkedIn's badge can fail to render in time, causing duplicate applications).
        if (previouslyAppliedIds.has(jobId)) {
          log(`⏭️  Already applied (from history): ${displayTitle}`, 'info');
          continue;
        }
        const appliedEl = await page.$(['.jobs-s-apply--applied', 'button[aria-label*="Applied"]'].join(', ')).catch(() => null);
        if (appliedEl) { log(`⏭️  Already applied: ${displayTitle}`, 'info'); continue; }

        // Compatibility
        const assessment = assessJob(displayTitle, displayCompany, description, targetRoles, pref, profileCategory);
        log(`   Score: ${assessment.score}/10 — ${assessment.reason}`, assessment.compatible ? 'info' : 'warning');

        if (!assessment.compatible || assessment.score < MIN_SCORE) {
          log(`❌ Skip: ${displayTitle} (${assessment.skipReason || assessment.reason})`, 'warning');
          skipped.push({ jobId, title: displayTitle, company: displayCompany, score: assessment.score, reason: assessment.skipReason || assessment.reason });
          continue;
        }

        // ── Easy Apply button — Locator-based detection (auto re-resolves) ─────
        // IMPORTANT: use page.locator()/getByRole() everywhere, never page.$()
        // or page.$$() for this. Those return static ElementHandles that can go
        // STALE if LinkedIn's SPA re-renders the panel between detection and
        // click — that staleness was the cause of "elementHandle.click: Timeout"
        // errors. Locators re-resolve the element fresh at click time.
        await page.waitForSelector(
          '.jobs-apply-button, [class*="jobs-s-apply"], .job-details-jobs-unified-top-card__container, .jobs-details__main-content',
          { timeout: 8000 }
        ).catch(() => {});

        let easyBtn = null;
        const byRole = page.getByRole('button', { name: /easy apply/i }).first();
        if (await byRole.isVisible({ timeout: 6000 }).catch(() => false)) {
          easyBtn = byRole;
        } else {
          const byAria = page.locator('button[aria-label*="Easy Apply" i]').first();
          if (await byAria.isVisible({ timeout: 2000 }).catch(() => false)) {
            easyBtn = byAria;
          } else {
            const byText = page.locator('button', { hasText: /easy apply/i }).first();
            if (await byText.isVisible({ timeout: 2000 }).catch(() => false)) easyBtn = byText;
          }
        }

        if (!easyBtn) {
          // Debug visibility: log what apply-related buttons WERE found, so
          // false negatives are diagnosable instead of silent.
          const otherApplyBtns = await page.$$eval('button', btns =>
            btns.map(b => (b.innerText || '').trim()).filter(t => /apply/i.test(t)).slice(0, 3)
          ).catch(() => []);
          log(`📌 No Easy Apply — added to manual list: ${displayTitle}${otherApplyBtns.length ? ' (saw: ' + otherApplyBtns.join(', ') + ')' : ''}`, 'info');
          manualApply.push({
            jobId, title: displayTitle, company: displayCompany,
            score: assessment.score, reason: assessment.reason,
            url:   `https://www.linkedin.com/jobs/view/${jobId}/`,
            foundAt: new Date().toISOString()
          });
          continue;
        }

        // ── Click — if it fails (stale/covered/closed listing), fall back to
        // the manual list with a clean message instead of a cryptic raw error.
        log(`🚀 Applying: ${displayTitle} @ ${displayCompany}`, 'success');
        try {
          await easyBtn.scrollIntoViewIfNeeded().catch(() => {});
          await easyBtn.click({ timeout: 10000 });
        } catch (clickErr) {
          log(`⚠️  Couldn't open Easy Apply for ${displayTitle} — added to manual list instead.`, 'warning');
          manualApply.push({
            jobId, title: displayTitle, company: displayCompany,
            score: assessment.score, reason: 'Easy Apply button could not be opened',
            url:   `https://www.linkedin.com/jobs/view/${jobId}/`,
            foundAt: new Date().toISOString()
          });
          continue;
        }
        await page.waitForTimeout(2500);

        const result = await handleEasyApplyModal(page, log);
        // result can be: true (success) | false (failed) | { skipped, reason } (missing info)
        if (result === true) {
          applied.push({ jobId, title: displayTitle, company: displayCompany, score: assessment.score, reason: assessment.reason, url: `https://www.linkedin.com/jobs/view/${jobId}/`, appliedAt: new Date().toISOString() });
          log(`🎉 Applied: ${displayTitle} @ ${displayCompany}`, 'success');

          // ── Self-learning: save this run's Q&A to the question bank ───────
          const sessionQA = formFiller.getSessionLog();
          if (sessionQA.length) {
            const bank = s.get('questionBank', []);   // this user's own private bank
            for (const qa of sessionQA) {
              const idx = bank.findIndex(b => b.question === qa.question);
              if (idx >= 0) { bank[idx].answer = qa.answer; bank[idx].usedCount = (bank[idx].usedCount || 1) + 1; }
              else bank.push({ question: qa.question, answer: qa.answer, usedCount: 1, learnedAt: new Date().toISOString() });
            }
            s.set('questionBank', bank.slice(-500)); // keep last 500 unique questions
            log(`   🧠 Learned ${sessionQA.length} Q&A pairs (bank: ${bank.length} total)`, 'info');
          }
        } else if (result && result.skipped) {
          // Skipped due to missing required info — log and move to next job, NO halt
          log(`⏭️  Skipped: ${displayTitle} — ${result.reason}`, 'warning');
          skipped.push({ jobId, title: displayTitle, company: displayCompany, score: assessment.score, reason: result.reason });
          await page.keyboard.press('Escape').catch(() => {});
        } else {
          errors.push(`Could not complete: ${displayTitle} @ ${displayCompany}`);
          await page.keyboard.press('Escape').catch(() => {});
        }

        await page.waitForTimeout(2000);

        // ── Pause check: wait here until user resumes ───────────────────────
        if (agentState.isPaused()) {
          log('⏸️  Agent PAUSED after this job. Edit any values in Chrome, then click Resume in the Dashboard.', 'warning');
          await waitForResume();
          log('▶️  Agent resumed — continuing to next job...', 'success');
        }

      } catch (err) {
        // Playwright error messages often include a multi-line call log —
        // keep only the first line so the live log / floating widget stay readable.
        const shortMsg = String(err.message || err).split('\n')[0].slice(0, 140);
        log(`❌ Error on job ${jobId}: ${shortMsg}`, 'error');
        errors.push(`Job ${jobId}: ${shortMsg}`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
  }

  } catch (fatalErr) {
    log(`❌ Agent stopped unexpectedly: ${fatalErr.message}`, 'error');
    errors.push(`Fatal: ${fatalErr.message}`);
  } finally {
    agentState.setContext(null);
    if (!chromeClosedExternally) {
      await context.close().catch(() => {});
    }
  }

  log('🏁 Agent finished. Browser closed.', 'success');
  if (manualApply.length > 0) {
    log(`📌 ${manualApply.length} job(s) found for manual apply — check dashboard.`, 'info');
  }
  return { applied, skipped, errors, manualApply, timestamp: new Date().toISOString() };
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function loginWithCredentials(page, email, password, log) {
  // LinkedIn no longer uses id/name attributes — use type selectors which always work
  const emailSel = 'input[type="email"]';
  const passSel  = 'input[type="password"]';

  log('   Navigating to LinkedIn login page...', 'info');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for JS to finish rendering the form (domcontentloaded alone fires too early)
  await page.waitForLoadState('load', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (await checkLoggedIn(page)) { log('✅ Session restored from cookies', 'success'); return; }

  // LinkedIn renders multiple forms (some hidden). Find the VISIBLE email input.
  log('   Waiting for login form...', 'info');
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('input[type="email"]')).some(el => el.offsetParent !== null),
    { timeout: 15000 }
  ).catch(() => {});

  const emailInputs = await page.$$('input[type="email"]');
  let emailEl = null;
  for (const el of emailInputs) {
    if (await el.isVisible()) { emailEl = el; break; }
  }
  if (!emailEl && emailInputs.length) emailEl = emailInputs[0]; // fallback to first

  if (!emailEl) {
    if (await checkLoggedIn(page)) { log('✅ Already logged in', 'success'); return; }
    throw new Error('LinkedIn login form did not appear. Check your internet connection.');
  }

  const passInputs = await page.$$('input[type="password"]');
  let passEl = null;
  for (const el of passInputs) {
    if (await el.isVisible()) { passEl = el; break; }
  }
  if (!passEl && passInputs.length) passEl = passInputs[0];

  log('   Entering email...', 'info');
  await emailEl.click();
  await emailEl.fill(email);
  await page.waitForTimeout(600);

  log('   Entering password...', 'info');
  if (passEl) {
    await passEl.click();
    await passEl.fill(password);
  }
  await page.waitForTimeout(600);

  log('   Submitting...', 'info');
  // Find the visible submit button (LinkedIn has multiple hidden forms each with a submit button)
  const submitBtns = await page.$$('button[type="submit"]');
  let submitBtn = null;
  for (const btn of submitBtns) {
    if (await btn.isVisible()) { submitBtn = btn; break; }
  }
  if (!submitBtn) {
    // Fallback: button with sign-in text
    try { submitBtn = await page.getByRole('button', { name: /sign in/i }).first(); } catch {}
  }
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // Last resort: press Enter from the password field
    if (passEl) await passEl.press('Enter');
  }
  // Wait for the post-submit state to settle
  await page.waitForTimeout(4000);

  const postUrl = page.url();
  log(`   Post-login URL: ${postUrl.split('?')[0]}`, 'info');

  // Already on feed — done
  if (await checkLoggedIn(page)) { log('✅ Logged in successfully', 'success'); return; }

  // External checkpoint URL
  if (postUrl.includes('checkpoint') || postUrl.includes('challenge') ||
      postUrl.includes('two-step') || postUrl.includes('verify')) {
    const ok = await handleMobileVerification(page, log);
    if (!ok) throw new Error('Mobile verification timed out. Please try again.');
    await page.waitForTimeout(4000); // let LinkedIn finish redirecting to /feed
    if (!await checkLoggedIn(page)) throw new Error('Login failed after verification.');
    log('✅ Logged in successfully', 'success');
    return;
  }

  // Still on /login/ — LinkedIn shows 2FA inline on the SAME URL
  // Poll for up to 5 minutes: watch for feed redirect or verification elements
  if (postUrl.includes('/login')) {
    log('📱 LinkedIn 2FA detected (inline). Approve on your phone or enter the code shown in Chrome.', 'warning');
    log('   The agent will click "Send again" every 30 seconds. Waiting up to 5 min...', 'info');

    const deadline   = Date.now() + 5 * 60 * 1000;
    let   pollCount  = 0;

    while (Date.now() < deadline) {
      await page.waitForTimeout(5000);
      pollCount++;

      if (await checkLoggedIn(page)) {
        log('✅ Logged in — 2FA approved!', 'success');
        return;
      }

      const curUrl = page.url();
      if (curUrl.includes('checkpoint') || curUrl.includes('challenge') || curUrl.includes('verify')) {
        const ok = await handleMobileVerification(page, log);
        if (!ok) throw new Error('Mobile verification timed out.');
        await page.waitForTimeout(4000); // let LinkedIn finish redirecting to /feed
        if (!await checkLoggedIn(page)) throw new Error('Login failed after verification.');
        log('✅ Logged in successfully', 'success');
        return;
      }

      // Every ~30s: try to click Send again / Resend
      if (pollCount % 6 === 0) {
        const resendSelectors = [
          'button:has-text("Send again")', 'button:has-text("Resend")',
          'a:has-text("Send again")',       'a:has-text("Resend")',
          '[data-test-id*="resend"]'
        ];
        for (const sel of resendSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 })) {
              await btn.click();
              const rem = Math.round((deadline - Date.now()) / 1000);
              log(`   📲 Clicked "Send again" — approve on your LinkedIn app (${rem}s left)`, 'info');
              break;
            }
          } catch {}
        }
      }
    }
    throw new Error('Login timed out waiting for 2FA approval (5 min). Please try again.');
  }

  if (!await checkLoggedIn(page)) throw new Error('Login failed — check your email and password in Settings.');
  log('✅ Logged in successfully', 'success');
}

// ── Mobile Verification Handler ───────────────────────────────────────────────

async function handleMobileVerification(page, log) {
  log('', 'info');
  log('📱 ─────────────────────────────────────────────────────', 'warning');
  log('📱  LINKEDIN MOBILE VERIFICATION REQUIRED', 'warning');
  log('📱  Open the LinkedIn app on your phone and tap', 'warning');
  log('📱  "Yes, it\'s me" (or enter the code shown here).', 'warning');
  log('📱  The agent will auto-click "Send again" every 30s.', 'warning');
  log('📱  Waiting up to 5 minutes...', 'warning');
  log('📱 ─────────────────────────────────────────────────────', 'warning');

  const deadline   = Date.now() + 5 * 60 * 1000; // 5 minutes
  let   pollCount  = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(5000); // poll every 5 seconds
    pollCount++;

    const url = page.url();

    // ── Success: left the challenge page ─────────────────────────────────
    if (
      url.includes('/feed') ||
      url.includes('/home') ||
      (!url.includes('checkpoint') && !url.includes('challenge') &&
       !url.includes('verify') && !url.includes('login'))
    ) {
      log('✅ Mobile verification approved! Waiting for LinkedIn to load...', 'success');
      await page.waitForTimeout(4000); // let /feed fully load before caller checks login
      return true;
    }

    // ── Every 30 seconds: click "Send again" / "Resend" ──────────────────
    if (pollCount % 6 === 0) {
      const remaining = Math.round((deadline - Date.now()) / 1000);

      // Try all known selector variants for the resend button
      const resendSelectors = [
        'button:has-text("Send again")',
        'button:has-text("Resend")',
        'button:has-text("send again")',
        'a:has-text("Send again")',
        'a:has-text("Resend")',
        '[data-test-id*="resend"]',
        '[id*="resend"]'
      ];

      let clicked = false;
      for (const sel of resendSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            log(`   📲 Clicked "Send again" — check your LinkedIn app! (${remaining}s left)`, 'info');
            clicked = true;
            break;
          }
        } catch { /* try next */ }
      }

      if (!clicked) {
        log(`   ⏳ Waiting for you to approve on your phone... (${remaining}s left)`, 'info');
      }
    }
  }

  log('⏰ Mobile verification timed out after 5 minutes.', 'error');
  return false;
}

// ── Pause / Resume helper ─────────────────────────────────────────────────────
// Uses setInterval (not Playwright's waitForTimeout) so the Node.js event loop
// stays free to handle the 'app:resume-agent' IPC call from the dashboard.
function waitForResume() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      // Also exit if the agent was force-stopped (e.g., Chrome closed externally
      // or the emergency Stop button was pressed), or if the user requested
      // skipping this job while paused — otherwise either case would wait
      // forever with no way to recover/progress.
      if (!agentState.isPaused() || agentState.isStopped() || agentState.isSkipRequested()) {
        clearInterval(check);
        resolve();
      }
    }, 500);
  });
}

// ── Collect Job IDs ───────────────────────────────────────────────────────────

async function collectJobIds(page) {
  const ids = new Set();
  let prev  = 0;

  for (let i = 0; i < 5; i++) {
    const links = await page.$$eval('a.job-card-container__link, a[href*="/jobs/view/"]',
      els => els.map(el => { const m = el.href.match(/\/jobs\/view\/(\d+)/); return m ? m[1] : null; }).filter(Boolean)
    );
    links.forEach(id => ids.add(id));
    if (ids.size === prev) break;
    prev = ids.size;
    await page.evaluate(() => { const p = document.querySelector('.jobs-search-results-list, .scaffold-layout__list'); if (p) p.scrollBy(0, 600); });
    await page.waitForTimeout(1500);
  }
  return [...ids];
}

// ── Easy Apply Modal ──────────────────────────────────────────────────────────

async function handleEasyApplyModal(page, log) {
  let prevBodyText = '';
  let stuckCount   = 0;

  // Defensive: clear any leftover skip request from a previous job so it
  // can never accidentally carry over and skip a DIFFERENT job by mistake.
  agentState.clearSkipRequest();

  for (let step = 0; step < 25; step++) {
    if (agentState.isStopped()) { log('🛑 Stopped — exiting form.', 'warning'); return false; }

    // ── Skip check: user clicked "⏭ Skip Job" on the floating control ──────
    if (agentState.isSkipRequested()) {
      agentState.clearSkipRequest();
      log('⏭️  Job skipped by user request.', 'warning');
      await page.click('button[aria-label="Dismiss"], .artdeco-modal__dismiss').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      return { skipped: true, reason: 'Skipped by user' };
    }

    await page.waitForTimeout(1500);

    // ── Pause check between each modal step ───────────────────────────────
    if (agentState.isPaused()) {
      log('⏸️  Agent paused mid-form. Edit fields in Chrome, then click Resume.', 'warning');
      await waitForResume();
      if (agentState.isStopped()) { log('🛑 Stopped while paused — exiting form.', 'warning'); return false; }
      log('▶️  Resumed — continuing form...', 'success');
      await page.waitForTimeout(800); // brief wait so user's changes settle
      await relearnVisibleFields(page, log).catch(() => {}); // learn from whatever the user changed
    }

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

    // ── Success ───────────────────────────────────────────────────────────
    if (/your application was sent|application was sent to/i.test(bodyText)) {
      log('   ✅ Submission confirmed', 'success');
      await page.click('button[aria-label="Dismiss"], button:has-text("Not now"), .artdeco-modal__dismiss').catch(() => {});
      return true;
    }

    const modal = await page.$('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]').catch(() => null);
    if (!modal) {
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      return /application was sent|applied/i.test(text);
    }

    await fillVisibleFields(page, log);

    // ── Collect validation errors BEFORE clicking ─────────────────────────
    const validationErrors = await page.$$eval(
      '.artdeco-inline-feedback--error, [data-test-inline-feedback-message], .fb-dash-form-element__error-text',
      els => els.map(el => el.textContent.trim()).filter(Boolean)
    ).catch(() => []);

    const submitBtn  = await page.$('button[aria-label="Submit application"]');
    const reviewBtn  = await page.$('button[aria-label="Review your application"], button[aria-label="Review"]');
    const nextBtn    = await page.$('button[aria-label="Continue to next step"]');
    const primaryBtn = await page.$('.jobs-easy-apply-modal .artdeco-button--primary');

    const btn = submitBtn || reviewBtn || nextBtn || primaryBtn;
    if (btn) {
      const label = await btn.evaluate(el => el.textContent.trim()).catch(() => '');
      log(`   ▶ Clicking: ${label}`, 'info');
      // Bounded timeout + force fallback — this is the single most critical
      // click in the whole flow; it must never hang for the full default 30s.
      try { await btn.click({ timeout: 4000 }); }
      catch { await btn.click({ force: true, timeout: 1500 }).catch(() => {}); }
    } else {
      log('   ⚠️  No actionable button — skipping job', 'warning');
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await page.waitForTimeout(2000);

    // ── Detect stuck form (same content = validation blocked progress) ─────
    const newBodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (newBodyText === prevBodyText) {
      stuckCount++;
      // Get fresh validation error messages after clicking
      const freshErrors = await page.$$eval(
        '.artdeco-inline-feedback--error, [data-test-inline-feedback-message], .fb-dash-form-element__error-text',
        els => els.map(el => el.textContent.trim()).filter(Boolean)
      ).catch(() => []);

      if (stuckCount >= 2) {
        const errMsg = freshErrors.length
          ? `Missing required info: ${freshErrors.slice(0, 3).join('; ')}`
          : 'Form not advancing — possibly a required field is missing';
        log(`   ⚠️  ${errMsg}. Skipping this job.`, 'warning');
        await page.keyboard.press('Escape').catch(() => {});
        return { skipped: true, reason: errMsg };
      }
    } else {
      stuckCount   = 0;
      prevBodyText = newBodyText;
    }
  }

  log('   ⚠️  Maximum steps reached — skipping job', 'warning');
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

// ── Robust click for radio/checkbox inputs ────────────────────────────────────
// CRITICAL FIX: many forms (including some LinkedIn Easy Apply variants and
// third-party ATS embeds) visually hide the native <input type="radio"/checkbox">
// behind a styled <label> — the real, visible, clickable element is the label,
// not the input. Playwright's plain handle.click() waits up to its default
// 30s actionability timeout for the input to become "visible" before giving
// up — which it never will, since it's intentionally hidden by CSS. With many
// radio options on a page (and the per-fieldset loop retrying the same step
// repeatedly because the required field never gets answered), this is exactly
// what produced the "stuck and skipping" behavior. Fix: try the input with a
// SHORT timeout, fall back to clicking the label, then force-click as a last
// resort (bypasses actionability checks entirely).
async function robustClick(page, handle) {
  try {
    await handle.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await handle.click({ timeout: 2500 });
    return true;
  } catch {}
  try {
    const id = await handle.getAttribute('id');
    if (id) {
      const lbl = await page.$(`label[for="${id}"]`);
      if (lbl) { await lbl.click({ timeout: 2500 }); return true; }
    }
  } catch {}
  try {
    await handle.click({ force: true, timeout: 1500 });
    return true;
  } catch {}
  return false;
}

// ── Frequent pause checkpoint ─────────────────────────────────────────────────
// CRITICAL FIX: previously Pause was only checked once per modal STEP, before
// fillVisibleFields() ran — meaning a click on Pause could sit unacknowledged
// for the ENTIRE field-filling pass (many fields × robustClick's multi-second
// retries adds up). That long, silent delay is what made Pause feel like it
// "didn't work". This checkpoint is sprinkled between every field-type
// section below so pausing engages within a couple of seconds, not after the
// whole step finishes.
// Returns true if the caller should STOP doing further field work right now
// (stop requested, or skip requested — either mid-fill or while paused).
async function pauseCheckpoint(page, log) {
  if (agentState.isStopped() || agentState.isSkipRequested()) return true;
  if (agentState.isPaused()) {
    log('⏸️  Agent paused. Edit values in Chrome, then click Resume.', 'warning');
    await waitForResume();
    if (agentState.isStopped() || agentState.isSkipRequested()) return true;
    log('▶️  Resumed.', 'success');
    await relearnVisibleFields(page, log).catch(() => {}); // learn from whatever the user changed
  }
  return false;
}

// ── Form Field Filler ─────────────────────────────────────────────────────────

async function fillVisibleFields(page, log) {
  const answer = (q, type, opts) => formFiller.getFormAnswer(q, type, opts);

  // ── Phone country code picker (custom button) ──────────────────────────
  try {
    const countryBtn = await page.$([
      '.jobs-easy-apply-modal button[aria-label*="Phone country"]',
      '.jobs-easy-apply-modal button[aria-label*="country"]',
      '.jobs-easy-apply-modal .phone-country-code button',
      '.jobs-easy-apply-modal [data-test-phone-country] button'
    ].join(', '));

    if (countryBtn && (await countryBtn.evaluate(el => el.tagName.toLowerCase())) !== 'select') {
      const cur = (await countryBtn.textContent() || '').trim();
      if (!/india|\+91/i.test(cur)) {
        await countryBtn.click();
        await page.waitForTimeout(800);
        await page.keyboard.type('India', { delay: 60 });
        await page.waitForTimeout(600);
        const opts = await page.$$('[role="option"], li[role="option"]');
        let picked = false;
        for (const o of opts) { const t = (await o.textContent()) || ''; if (/india/i.test(t)) { await o.click(); picked = true; break; } }
        if (!picked) await page.keyboard.press('Escape');
        else log('   Set phone country: India (+91)', 'info');
      }
    }
  } catch { /* skip */ }

  if (await pauseCheckpoint(page, log)) return;

  // ── Text / number / tel inputs ────────────────────────────────────────────
  const inputs = await page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input[type="number"], .jobs-easy-apply-modal input[type="tel"]');
  for (const input of inputs) {
    try {
      const existing = await input.inputValue();
      // Skip only if a real non-zero value is already there.
      // '0' is LinkedIn's default placeholder — treat it as "not filled".
      if (existing?.trim() && existing.trim() !== '0') continue;
      const label  = await getLabelFor(page, input);
      if (!label) continue;
      const ans = answer(label, 'text');
      if (!ans) continue;
      await input.click();
      await input.fill(String(ans));
      await page.waitForTimeout(250);
      // City typeahead
      if (/city|location/i.test(label)) {
        await page.waitForTimeout(800);
        const sug = await page.$('.jobs-easy-apply-modal [role="option"], .jobs-easy-apply-modal .basic-typeahead__option');
        if (sug) { await sug.click(); log(`   Selected city suggestion for "${label}"`, 'info'); continue; }
      }
      log(`   Filled "${label}": ${ans}`, 'info');
    } catch { /* skip */ }
  }

  if (await pauseCheckpoint(page, log)) return;

  // ── Textareas ─────────────────────────────────────────────────────────────
  for (const ta of await page.$$('.jobs-easy-apply-modal textarea')) {
    try {
      if ((await ta.inputValue())?.trim()) continue;
      const label = await getLabelFor(page, ta);
      if (!label) continue;
      const ans = answer(label, 'textarea');
      if (ans) { await ta.fill(String(ans)); log(`   Filled textarea "${label}"`, 'info'); }
    } catch { /* skip */ }
  }

  if (await pauseCheckpoint(page, log)) return;

  // ── Native <select> dropdowns ─────────────────────────────────────────────
  for (const sel of await page.$$('.jobs-easy-apply-modal select')) {
    try {
      const existing     = await sel.inputValue();
      const selectedText = await sel.evaluate(el => (el.options[el.selectedIndex]||{}).text||'').catch(() => '');
      if (existing && existing !== '' && !/^select|^choose|^--/i.test(selectedText)) continue;

      const label   = await getLabelFor(page, sel);
      const options = await sel.$$eval('option', opts => opts.map(o => o.textContent.trim()).filter(t => t && !/select an option/i.test(t)));
      if (!options.length) continue;

      const ans = answer(label || '', 'select', options);
      if (ans) {
        let matched = options.find(o => o.toLowerCase() === String(ans).toLowerCase());
        if (!matched && /country/i.test(label||'')) matched = options.find(o => /^india$/i.test(o.trim()));
        await sel.selectOption({ label: matched || options[0] });
        log(`   Selected "${label}": ${matched || options[0]}`, 'info');
      }
    } catch { /* skip */ }
  }

  if (await pauseCheckpoint(page, log)) return;

  // ── Artdeco / SDUI custom dropdowns (buttons only — no native selects) ────
  const dropdownTriggers = await page.$$([
    '.jobs-easy-apply-modal [data-test-text-entity-list-form-component] button',
    '.jobs-easy-apply-modal button[role="combobox"]',
    '.jobs-easy-apply-modal .artdeco-dropdown__trigger',
    '.jobs-easy-apply-modal .artdeco-select button'
  ].join(', '));

  for (const trigger of dropdownTriggers) {
    try {
      const tagName = await trigger.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
      if (tagName === 'select') continue;

      const curVal = (await trigger.textContent() || '').trim();
      if (curVal && !/^select|^choose/i.test(curVal)) continue;

      const label = await getLabelFor(page, trigger);
      await trigger.click();
      await page.waitForTimeout(900);

      const optEls = await page.$$('[role="option"], .artdeco-dropdown__item, li.jobs-easy-apply-form-section__select-option');
      if (!optEls.length) { await trigger.press('Escape').catch(() => {}); continue; }

      const opts    = await Promise.all(optEls.map(el => el.textContent().then(t => t.trim())));
      const filtered = opts.filter(Boolean);

      // Country heuristic
      const isCountryList = filtered.length > 30 && filtered.some(o => /^india$/i.test(o)) && filtered.some(o => /united states|united kingdom/i.test(o));

      let clicked = false;
      if (isCountryList || /country/i.test(label||'')) {
        for (const el of optEls) { const t = (await el.textContent()).trim(); if (/^india$/i.test(t)) { await el.click(); log(`   Dropdown "${label||'Country'}": India`, 'info'); clicked = true; break; } }
      }
      if (!clicked) {
        const ans = answer(label || '', 'select', filtered);
        for (const el of optEls) { const t = (await el.textContent()).trim(); if (t.toLowerCase() === (ans||'').toLowerCase()) { await el.click(); log(`   Dropdown "${label}": ${t}`, 'info'); clicked = true; break; } }
      }
      if (!clicked && optEls.length) { await optEls[0].click(); log(`   Dropdown "${label}" fallback: ${filtered[0]}`, 'info'); }
      await page.waitForTimeout(400);
    } catch { /* skip */ }
  }

  if (await pauseCheckpoint(page, log)) return;

  // ── Radio buttons (fieldsets) ─────────────────────────────────────────────
  // Re-query fresh each iteration — React may re-render after each click making
  // previously collected handles stale. This ensures ALL groups are answered.
  {
    const totalFieldsets = (await page.$$('.jobs-easy-apply-modal fieldset')).length;
    for (let fi = 0; fi < totalFieldsets; fi++) {
      if (await pauseCheckpoint(page, log)) return;  // radios are the slowest part (robustClick retries) — check every fieldset
      const freshFieldsets = await page.$$('.jobs-easy-apply-modal fieldset');
      const fieldset = freshFieldsets[fi];
      if (!fieldset) break;
      try {
        const radios = await fieldset.$$('input[type="radio"]');
        if (!radios.length) continue;
        if (await fieldset.$('input[type="radio"]:checked')) continue;

        const legend = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
        const labels = await Promise.all(radios.map(async r => {
          const id = await r.getAttribute('id');
          return page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => '');
        }));
        const ans = answer(legend, 'radio', labels.filter(Boolean));

        // Rule A10-C: YES by default unless CV clearly contradicts
        let matched = false;
        for (let i = 0; i < labels.length; i++) {
          if (labels[i].toLowerCase() === (ans||'').toLowerCase() ||
              (ans && labels[i].toLowerCase().includes((ans||'').toLowerCase()))) {
            const ok = await robustClick(page, radios[i]);
            log(ok ? `   Radio "${legend}": ${labels[i]}` : `   ⚠️ Could not click radio "${legend}": ${labels[i]}`, ok ? 'info' : 'warning');
            matched = true;
            await page.waitForTimeout(300);
            break;
          }
        }
        if (!matched) {
          const yesIdx = labels.findIndex(l => /^yes$/i.test(l.trim()));
          if (yesIdx >= 0) {
            const ok = await robustClick(page, radios[yesIdx]);
            log(ok ? `   Radio "${legend}" → Yes (default)` : `   ⚠️ Could not click radio "${legend}"`, ok ? 'info' : 'warning');
          } else if (radios.length) {
            const ok = await robustClick(page, radios[0]);
            log(ok ? `   Radio "${legend}" → ${labels[0]} (default)` : `   ⚠️ Could not click radio "${legend}"`, ok ? 'info' : 'warning');
          }
          await page.waitForTimeout(300);
        }
      } catch { /* skip */ }
    }
  }

  // ── Checkboxes ────────────────────────────────────────────────────────────
  for (const fieldset of await page.$$('.jobs-easy-apply-modal fieldset')) {
    try {
      const checkboxes = await fieldset.$$('input[type="checkbox"]');
      if (!checkboxes.length) continue;
      const legend   = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
      const cbLabels = await Promise.all(checkboxes.map(async cb => { const id = await cb.getAttribute('id'); return page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => ''); }));
      const ans      = answer(legend, 'checkbox', cbLabels.filter(Boolean));

      for (let i = 0; i < cbLabels.length; i++) {
        const isChecked = await checkboxes[i].isChecked();
        const matches   = (ans||'').toLowerCase().split(',').some(a => cbLabels[i].toLowerCase().includes(a.trim()) || a.trim().includes(cbLabels[i].toLowerCase()));
        if (matches && !isChecked) {
          const ok = await robustClick(page, checkboxes[i]);
          log(ok ? `   Checked "${legend}" → "${cbLabels[i]}"` : `   ⚠️ Could not check "${legend}" → "${cbLabels[i]}"`, ok ? 'info' : 'warning');
        }
      }
    } catch { /* skip */ }
  }
}

// ── Re-learn from manual edits made while paused ────────────────────────────
// READ-ONLY mirror of fillVisibleFields(): instead of filling fields, it
// captures whatever is CURRENTLY in each field and feeds it into the
// self-learning bank. Called right after Resume — the user paused
// specifically to correct something, so whatever they left in the field
// is treated as the trusted, correct answer for that question going forward.
async function relearnVisibleFields(page, log) {
  let learned = 0;

  // Text / number / tel inputs
  for (const input of await page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input[type="number"], .jobs-easy-apply-modal input[type="tel"]')) {
    try {
      const val = (await input.inputValue() || '').trim();
      if (!val) continue;
      const label = await getLabelFor(page, input);
      if (!label) continue;
      formFiller.recordManualAnswer(label, val);
      learned++;
    } catch { /* skip */ }
  }

  // Textareas
  for (const ta of await page.$$('.jobs-easy-apply-modal textarea')) {
    try {
      const val = (await ta.inputValue() || '').trim();
      if (!val) continue;
      const label = await getLabelFor(page, ta);
      if (!label) continue;
      formFiller.recordManualAnswer(label, val);
      learned++;
    } catch { /* skip */ }
  }

  // Native selects
  for (const sel of await page.$$('.jobs-easy-apply-modal select')) {
    try {
      const selectedText = await sel.evaluate(el => (el.options[el.selectedIndex] || {}).text || '').catch(() => '');
      if (!selectedText || /^select|^choose|^--/i.test(selectedText)) continue;
      const label = await getLabelFor(page, sel);
      if (!label) continue;
      formFiller.recordManualAnswer(label, selectedText.trim());
      learned++;
    } catch { /* skip */ }
  }

  // Radio fieldsets — whichever option is currently checked
  for (const fieldset of await page.$$('.jobs-easy-apply-modal fieldset')) {
    try {
      const checkedRadio = await fieldset.$('input[type="radio"]:checked');
      if (!checkedRadio) continue;
      const legend = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
      if (!legend) continue;
      const id = await checkedRadio.getAttribute('id');
      const label = id ? await page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => '') : '';
      if (!label) continue;
      formFiller.recordManualAnswer(legend, label);
      learned++;
    } catch { /* skip */ }
  }

  // Checkbox fieldsets — whichever boxes are currently checked
  for (const fieldset of await page.$$('.jobs-easy-apply-modal fieldset')) {
    try {
      const checkedBoxes = await fieldset.$$('input[type="checkbox"]:checked');
      if (!checkedBoxes.length) continue;
      const legend = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
      if (!legend) continue;
      const labels = await Promise.all(checkedBoxes.map(async cb => {
        const id = await cb.getAttribute('id');
        return id ? page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => '') : '';
      }));
      const joined = labels.filter(Boolean).join(', ');
      if (!joined) continue;
      formFiller.recordManualAnswer(legend, joined);
      learned++;
    } catch { /* skip */ }
  }

  if (learned > 0) log(`   🧠 Learned ${learned} field value(s) from your manual edits.`, 'success');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLabelFor(page, element) {
  return page.evaluate(el => {
    const id = el.id || el.getAttribute('id');
    if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) return lbl.textContent.trim(); }
    const container = el.closest('.fb-form-element, .jobs-easy-apply-form-element, .fb-dash-form-element, .artdeco-form__group, .jobs-easy-apply-form-section__grouping');
    if (container) { const lbl = container.querySelector('label, legend, h3, span.visually-hidden, .fb-form-element__label'); if (lbl) return lbl.textContent.trim(); }
    return el.placeholder || el.getAttribute('aria-label') || '';
  }, element).catch(() => '');
}

async function checkLoggedIn(page) {
  const url = page.url();
  // If the URL itself shows the feed/home — we are logged in (nav may still be loading)
  if (url.includes('/feed') || url.includes('/mynetwork') || url.includes('/jobs') ||
      url.includes('/messaging') || url.includes('/notifications') || url.includes('/home')) {
    return true;
  }
  // Otherwise require the nav element too
  return !url.includes('/login') && !url.includes('/authwall') && !url.includes('/uas/login') &&
    await page.$('nav.global-nav, .global-nav').catch(() => null) !== null;
}

async function extractText(page, selectors) {
  for (const sel of selectors) {
    try { const el = await page.$(sel); if (el) return (await el.textContent()).trim(); } catch { /* next */ }
  }
  return '';
}

// ── Compatibility Assessment ──────────────────────────────────────────────────

function assessJob(title, company, description, targetRoles, pref, profileCategory = 'tech') {
  const t    = title.toLowerCase();
  const desc = (description || '').toLowerCase().substring(0, 3000);

  // Hard-skip roles that don't match the profile's category
  const techOnlySkip    = ['marketing', 'sales manager', 'accountant', 'finance manager', 'hr manager',
                           'recruiter', 'graphic design', 'content writer', 'seo', 'social media',
                           'business development', 'data entry', 'receptionist', 'customer support',
                           'inside sales', 'account executive', 'copywriter'];
  const nonTechOnlySkip = ['software engineer', 'frontend developer', 'backend developer', 'full stack',
                           'data scientist', 'ml engineer', 'devops engineer', 'sre', 'site reliability',
                           'mobile developer', 'android developer', 'ios developer'];

  if (profileCategory === 'tech'     && nonTechOnlySkip.some(k => t.includes(k)))
    return { compatible: false, score: 1, reason: '', skipReason: `Pure dev role — not relevant for ${profileCategory} PM profile` };
  if (profileCategory === 'non-tech' && techOnlySkip.some(k => t.includes(k)))
    return { compatible: false, score: 1, reason: '', skipReason: `Role unrelated to non-tech profile` };

  const marketingSkip = ['marketing program', 'b2b marketing', 'sales program', 'ad operations', 'digital marketing', 'growth marketing', 'brand program', 'content program', 'seo program', 'social media program', 'performance marketing', 'demand generation'];
  if (marketingSkip.some(k => t.includes(k))) return { compatible: false, score: 2, reason: '', skipReason: `Marketing/Sales role` };

  // Match against user's target roles
  for (const role of targetRoles) {
    const r = role.toLowerCase();
    if (t.includes(r) || t.includes(r.split(' ')[0])) return { compatible: true, score: 9, reason: `Matches target role: ${role}` };
  }

  const goodMatch = ['project manager', 'delivery manager', 'delivery lead', 'engagement manager', 'transformation manager', 'scrum master', 'agile coach', 'release train engineer', 'it delivery', 'operations manager'];
  if (goodMatch.some(k => t.includes(k))) return { compatible: true, score: 7, reason: 'Related management role' };

  const skipTitles = ['marketing', 'accountant', 'finance manager', 'hr manager', 'recruiter', 'graphic design', 'content writer', 'seo', 'social media', 'data entry', 'receptionist', 'customer support', 'inside sales', 'copywriter'];
  if (skipTitles.some(k => t.includes(k))) return { compatible: false, score: 2, reason: '', skipReason: `Unrelated role` };

  const descPM = ['program management', 'pmo', 'project management', 'delivery management', 'agile', 'scrum', 'stakeholder management', 'cross-functional'].some(k => desc.includes(k));
  if (descPM) return { compatible: true, score: 5, reason: 'Description mentions PM/delivery skills' };

  return { compatible: true, score: 4, reason: 'Found via search — borderline match' };
}

module.exports = { runLinkedInAgent };
