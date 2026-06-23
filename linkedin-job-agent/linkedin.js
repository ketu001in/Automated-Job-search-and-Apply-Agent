/**
 * linkedin.js
 * Playwright-based LinkedIn automation:
 *   - Session management (cookies)
 *   - Job search (past 24 hours, Easy Apply filter)
 *   - Job compatibility assessment via Claude
 *   - Easy Apply multi-step modal handler
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { assessJobCompatibility, getFormAnswer } = require('./claude');
const profile = require('./profile');

const COOKIES_FILE = path.join(__dirname, 'linkedin_session.json');
// HEADLESS=false in .env → show browser; anything else (or omitted) → headless
const HEADLESS = process.env.HEADLESS === 'false' ? false : true;

// ─── Session ──────────────────────────────────────────────────────────────────

async function saveCookies(context) {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

async function loadCookies(context) {
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    return true;
  }
  return false;
}

// ─── Main Agent Run ───────────────────────────────────────────────────────────

async function runLinkedInAgent(log) {
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 300,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-IN'
  });

  const hasCookies = await loadCookies(context);
  const page = await context.newPage();

  // ── Login ──────────────────────────────────────────────────────────────────
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const isLoggedIn = await checkLoggedIn(page);

    if (!isLoggedIn) {
      if (process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_PASSWORD) {
        log('🔐 Logging in with credentials...', 'info');
        await loginWithCredentials(page, log);
      } else {
        // No credentials — open browser for manual login (works for both first-time and expired sessions)
        if (hasCookies) {
          log('⚠️  LinkedIn session expired. Opening browser for manual re-login (set HEADLESS=false in .env if browser does not appear).', 'warning');
        } else {
          log('⚠️  No LinkedIn session found. Please log in manually in the browser window.', 'warning');
        }
        // Navigate to login page so user sees the form
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        log('👉 Log in to LinkedIn in the browser window — agent will continue automatically once logged in (waiting up to 5 min)...', 'info');
        await page.waitForURL('**/feed/**', { timeout: 300000 });
      }
    }
  } catch (err) {
    log(`❌ Login error: ${err.message}`, 'error');
    await browser.close();
    return { applied: [], skipped: [], errors: [`Login failed: ${err.message}`] };
  }

  await saveCookies(context);
  log('✅ Logged in to LinkedIn', 'success');

  const applied = [];
  const skipped = [];
  const errors = [];
  const seenJobIds = new Set();

  // ── Search Loop ────────────────────────────────────────────────────────────
  for (const query of profile.searchQueries) {
    log(`\n🔍 Searching: "${query}"`, 'info');

    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(profile.location)}&f_TPR=r86400&f_LF=f_AL&sortBy=DD`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } catch (err) {
      log(`⚠️  Could not load search page: ${err.message}`, 'warning');
      continue;
    }

    // Collect job IDs from the list panel
    const jobIds = await collectJobIds(page, log);
    log(`Found ${jobIds.length} jobs for "${query}"`, 'info');

    for (const jobId of jobIds) {
      if (seenJobIds.has(jobId)) {
        log(`⏭️  Duplicate job ID ${jobId}, skipping`, 'info');
        continue;
      }
      seenJobIds.add(jobId);

      try {
        // ── Load job inside search context (keeps Easy Apply button visible) ──
        // Using currentJobId param mirrors exactly how manual browsing works.
        const jobUrl = `${url}&currentJobId=${jobId}`;
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        // ── Extract job title & company from right panel ───────────────────
        const jobTitle = await page.evaluate(() => {
          const selectors = [
            '.job-details-jobs-unified-top-card__job-title h1',
            '.job-details-jobs-unified-top-card__job-title',
            '.jobs-unified-top-card__job-title h1',
            '.jobs-unified-top-card__job-title',
            'h1.t-24', 'h2.t-24', 'h1'
          ];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.trim();
          }
          return '';
        });

        const company = await page.evaluate(() => {
          const selectors = [
            '.job-details-jobs-unified-top-card__company-name a',
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name a',
            '.jobs-unified-top-card__company-name',
            '.topcard__org-name-link',
            '[data-tracking-control-name*="company-name"]'
          ];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.trim();
          }
          return '';
        });

        const description = await page.evaluate(() => {
          const selectors = [
            '.jobs-description-content__text',
            '.jobs-description__content',
            '.jobs-description',
            '#job-details'
          ];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.trim();
          }
          return '';
        });

        const displayTitle   = jobTitle.trim()   || `Job ${jobId}`;
        const displayCompany = company.trim()    || 'Unknown company';

        // ── Already applied? ───────────────────────────────────────────────
        const appliedEl = await page.$([
          '.jobs-s-apply--applied',
          'button[aria-label*="Applied"]',
          '.jobs-details-top-card__apply-error'
        ].join(', ')).catch(() => null);
        if (appliedEl) {
          log(`⏭️  Already applied: ${displayTitle} @ ${displayCompany}`, 'info');
          continue;
        }

        // ── Compatibility assessment ───────────────────────────────────────
        log(`🤖 Assessing: ${displayTitle} @ ${displayCompany}`, 'info');
        const assessment = assessJobCompatibility(displayTitle, displayCompany, description);
        log(`   Score: ${assessment.score}/10 — ${assessment.reason}`, assessment.compatible ? 'info' : 'warning');

        if (!assessment.compatible || assessment.score < profile.minCompatibilityScore) {
          log(`❌ Skip: ${displayTitle} (${assessment.skip_reason || assessment.reason})`, 'warning');
          skipped.push({ jobId, title: displayTitle, company: displayCompany, score: assessment.score, reason: assessment.skip_reason || assessment.reason });
          continue;
        }

        // ── Find Easy Apply button ─────────────────────────────────────────
        // Try multiple strategies — LinkedIn changes selectors frequently
        let easyApplyHandle = null;

        // Strategy 1: Playwright role-based (most reliable)
        try {
          easyApplyHandle = await page.getByRole('button', { name: /easy apply/i }).first();
          if (!await easyApplyHandle.isVisible({ timeout: 3000 })) easyApplyHandle = null;
        } catch { easyApplyHandle = null; }

        // Strategy 2: aria-label attribute
        if (!easyApplyHandle) {
          easyApplyHandle = await page.$('button[aria-label*="Easy Apply"], button[aria-label*="easy apply"]').catch(() => null);
        }

        // Strategy 3: any button with "Easy Apply" text
        if (!easyApplyHandle) {
          easyApplyHandle = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => /easy apply/i.test(b.innerText) && !b.disabled);
            return btn ? btn.getAttribute('data-control-name') || btn.className : null;
          }).then(async (info) => {
            if (!info) return null;
            return page.$(`button:has-text("Easy Apply")`).catch(() => null);
          }).catch(() => null);
        }

        if (!easyApplyHandle) {
          log(`⚠️  No Easy Apply button: ${displayTitle} @ ${displayCompany} (external apply only)`, 'warning');
          skipped.push({ jobId, title: displayTitle, company: displayCompany, score: assessment.score, reason: 'External apply only (no Easy Apply)' });
          continue;
        }

        log(`🚀 Applying to: ${displayTitle} @ ${displayCompany}`, 'success');
        await easyApplyHandle.click();
        await page.waitForTimeout(2500);

        // Handle modal
        const submitted = await handleEasyApplyModal(page, log);

        if (submitted) {
          applied.push({
            jobId,
            title: displayTitle,
            company: displayCompany,
            score: assessment.score,
            reason: assessment.reason,
            url: `https://www.linkedin.com/jobs/view/${jobId}/`,
            appliedAt: new Date().toISOString()
          });
          log(`🎉 Applied: ${jobTitle} @ ${company}`, 'success');
        } else {
          errors.push(`Could not complete application for ${jobTitle} @ ${company}`);
          log(`⚠️  Could not complete application for ${jobTitle}`, 'warning');
          // Dismiss any open modal
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(1000);
        }

        await page.waitForTimeout(2000);

      } catch (err) {
        log(`❌ Error on job ${jobId}: ${err.message}`, 'error');
        errors.push(`Job ${jobId}: ${err.message}`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
  }

  await browser.close();
  return { applied, skipped, errors, timestamp: new Date().toISOString() };
}

// ─── Login With Credentials ───────────────────────────────────────────────────

async function loginWithCredentials(page, log) {
  log('🌐 Loading LinkedIn login page...', 'info');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Wait up to 20s for the username field — handles slow page loads / redirects
  try {
    await page.waitForSelector(
      '#username, input[name="session_key"], input[autocomplete="username"]',
      { timeout: 20000 }
    );
  } catch {
    if (await checkLoggedIn(page)) {
      log('✅ Already logged in', 'success');
      return;
    }
    throw new Error('LinkedIn login page did not load. Try setting HEADLESS=false in .env to log in manually.');
  }

  // Fill with multiple selector fallbacks
  const emailSel = '#username, input[name="session_key"], input[autocomplete="username"]';
  const passSel  = '#password, input[name="session_password"], input[autocomplete="current-password"]';

  await page.fill(emailSel, process.env.LINKEDIN_EMAIL);
  await page.waitForTimeout(500);
  await page.fill(passSel, process.env.LINKEDIN_PASSWORD);
  await page.waitForTimeout(500);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  // Handle 2FA / security check
  if (
    page.url().includes('challenge') ||
    page.url().includes('checkpoint') ||
    page.url().includes('two-step')
  ) {
    log('⚠️  LinkedIn security check required. Complete it in the browser window (up to 2 min).', 'warning');
    await page.waitForURL('**/feed/**', { timeout: 120000 });
  }

  if (!await checkLoggedIn(page)) {
    throw new Error('Login failed — check LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env');
  }
  log('✅ Logged in with credentials', 'success');
}

// ─── Collect Job IDs ──────────────────────────────────────────────────────────

async function collectJobIds(page, log) {
  const ids = new Set();
  let previousCount = 0;

  for (let scroll = 0; scroll < 5; scroll++) {
    // Grab job card links
    const links = await page.$$eval(
      'a.job-card-container__link, a[href*="/jobs/view/"]',
      els => els.map(el => {
        const m = el.href.match(/\/jobs\/view\/(\d+)/);
        return m ? m[1] : null;
      }).filter(Boolean)
    );
    links.forEach(id => ids.add(id));

    if (ids.size === previousCount) break;
    previousCount = ids.size;

    // Scroll job list panel
    await page.evaluate(() => {
      const panel = document.querySelector('.jobs-search-results-list, .scaffold-layout__list');
      if (panel) panel.scrollBy(0, 600);
    });
    await page.waitForTimeout(1500);
  }

  return [...ids];
}

// ─── Easy Apply Modal Handler ─────────────────────────────────────────────────

async function handleEasyApplyModal(page, log) {
  for (let step = 0; step < 25; step++) {
    await page.waitForTimeout(1500);

    // Check for success
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Your application was sent') || bodyText.includes('application was sent to')) {
      log('   ✅ Submission confirmed', 'success');
      // Dismiss post-apply dialog
      await page.click('button[aria-label="Dismiss"], button:has-text("Not now"), .artdeco-modal__dismiss').catch(() => {});
      return true;
    }

    // Modal still open?
    const modal = await page.$('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]');
    if (!modal) {
      // Modal closed without success — might have submitted
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText);
      return text.includes('application was sent') || text.includes('Applied');
    }

    // Fill all visible form fields
    await fillVisibleFields(page, log);

    // Determine which button to click
    const submitBtn  = await page.$('button[aria-label="Submit application"]');
    const reviewBtn  = await page.$('button[aria-label="Review your application"], button[aria-label="Review"]');
    const nextBtn    = await page.$('button[aria-label="Continue to next step"]');
    const primaryBtn = await page.$('.jobs-easy-apply-modal .artdeco-button--primary');

    const btn = submitBtn || reviewBtn || nextBtn || primaryBtn;

    if (btn) {
      const label = await btn.evaluate(el => el.textContent.trim());
      log(`   ▶ Clicking: ${label}`, 'info');
      await btn.click();
    } else {
      log('   ⚠️  No actionable button found in modal', 'warning');
      return false;
    }

    await page.waitForTimeout(2000);
  }

  return false;
}

// ─── Form Field Filler ────────────────────────────────────────────────────────

async function fillVisibleFields(page, log) {

  // ── Phone country code (India +91) ───────────────────────────────────────
  // LinkedIn shows a custom country-code picker before the phone number field
  try {
    const countryBtn = await page.$([
      '.jobs-easy-apply-modal button[aria-label*="country"]',
      '.jobs-easy-apply-modal button[aria-label*="Phone country"]',
      '.jobs-easy-apply-modal .phone-country-code button',
      '.jobs-easy-apply-modal [data-test-phone-country] button',
      '.jobs-easy-apply-modal select[name*="countryCode"]',
      '.jobs-easy-apply-modal select[id*="phoneExtension"]'
    ].join(', '));

    if (countryBtn) {
      const tagName = await countryBtn.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        // Native select — pick India
        await countryBtn.selectOption({ label: /india/i }).catch(() =>
          countryBtn.selectOption({ value: 'IN' }).catch(() => {})
        );
        log('   Set country code: India (+91)', 'info');
      } else {
        // Custom button — click, type "India" to filter, then pick
        const current = await countryBtn.textContent();
        if (!/india|\+91/i.test(current || '')) {
          await countryBtn.click();
          await page.waitForTimeout(1000);
          // Type to filter — works regardless of whether there's a visible search box
          await page.keyboard.type('India', { delay: 80 });
          await page.waitForTimeout(700);
          // Find India in the now-filtered list
          const allOpts = await page.$$('[role="option"], li[role="option"]');
          let picked = false;
          for (const opt of allOpts) {
            const txt = (await opt.textContent()) || '';
            if (/india/i.test(txt)) {
              await opt.click();
              log('   Set country code: India (+91)', 'info');
              picked = true;
              break;
            }
          }
          if (!picked) await page.keyboard.press('Escape');
        }
      }
    }
  } catch { /* skip */ }

  // ── Text / Number / Tel inputs ────────────────────────────────────────────
  const inputs = await page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input[type="number"], .jobs-easy-apply-modal input[type="tel"]');
  for (const input of inputs) {
    try {
      const existing = await input.inputValue();
      if (existing && existing.trim() !== '') continue;

      const label = await getLabelFor(page, input);
      if (!label) continue;

      const answer = getFormAnswer(label, 'text');
      if (!answer) continue;

      await input.click();
      await input.fill(answer);
      await page.waitForTimeout(300);

      // ── City/location autocomplete: wait for suggestion list and click first match ──
      const lLower = label.toLowerCase();
      if (/city|location|current city|current location/.test(lLower)) {
        await page.waitForTimeout(900);
        const suggestion = await page.$(
          '.jobs-easy-apply-modal [role="option"], .jobs-easy-apply-modal .basic-typeahead__option, .jobs-easy-apply-modal li[data-test-text-entity-list-form-item-id]'
        );
        if (suggestion) {
          await suggestion.click();
          log(`   Selected city suggestion for "${label}"`, 'info');
          continue; // skip any further fill on this field
        }
      }

      log(`   Filled "${label}": ${answer}`, 'info');
    } catch { /* skip */ }
  }

  // ── Textareas ─────────────────────────────────────────────────────────────
  const textareas = await page.$$('.jobs-easy-apply-modal textarea');
  for (const ta of textareas) {
    try {
      const existing = await ta.inputValue();
      if (existing && existing.trim() !== '') continue;

      const label = await getLabelFor(page, ta);
      if (!label) continue;

      const answer = getFormAnswer(label, 'textarea');
      if (answer) {
        await ta.fill(answer);
        log(`   Filled textarea "${label}"`, 'info');
      }
    } catch { /* skip */ }
  }

  // ── Native <select> dropdowns ─────────────────────────────────────────────
  const selects = await page.$$('.jobs-easy-apply-modal select');
  for (const sel of selects) {
    try {
      const existing = await sel.inputValue();
      if (existing && existing !== '') continue;

      const label = await getLabelFor(page, sel);
      const options = await sel.$$eval('option', opts =>
        opts.map(o => o.textContent.trim()).filter(t => t && !/select an option/i.test(t))
      );
      if (!options.length) continue;

      const answer = getFormAnswer(label || '', 'select', options);
      if (answer) {
        // Try by label text first, then by index
        const matched = options.find(o => o.toLowerCase() === answer.toLowerCase());
        if (matched) {
          await sel.selectOption({ label: matched });
        } else {
          await sel.selectOption({ label: options[0] });
        }
        log(`   Selected "${label}": ${matched || options[0]}`, 'info');
      }
    } catch { /* skip */ }
  }

  // ── LinkedIn SDUI / artdeco custom dropdowns ──────────────────────────────
  // These show "Select an option" as a button and open a listbox
  const allDropdownTriggers = await page.$$([
    '.jobs-easy-apply-modal select[data-test-text-select-input]',
    '.jobs-easy-apply-modal [data-test-text-entity-list-form-component] button',
    '.jobs-easy-apply-modal button[role="combobox"]',
    '.jobs-easy-apply-modal .artdeco-dropdown__trigger',
    // artdeco-select (LinkedIn's own select component)
    '.jobs-easy-apply-modal .artdeco-select button',
    '.jobs-easy-apply-modal .fb-dash-form-element select'
  ].join(', '));

  for (const trigger of allDropdownTriggers) {
    try {
      const currentVal = (await trigger.textContent() || '').trim();
      if (currentVal && !/^select/i.test(currentVal)) continue; // already chosen

      const label = await getLabelFor(page, trigger);
      await trigger.click();
      await page.waitForTimeout(900);

      // Collect options from the opened listbox
      const optionEls = await page.$$([
        '[role="option"]',
        '.artdeco-dropdown__item',
        'li.jobs-easy-apply-form-section__select-option'
      ].join(', '));

      if (!optionEls.length) {
        await page.keyboard.press('Escape');
        continue;
      }

      const options = await Promise.all(optionEls.map(el => el.textContent().then(t => t.trim())));
      const answer = getFormAnswer(label || '', 'select', options.filter(Boolean));

      let clicked = false;
      for (const el of optionEls) {
        const text = (await el.textContent()).trim();
        if (text.toLowerCase() === (answer || '').toLowerCase()) {
          await el.click();
          log(`   Dropdown "${label}": ${text}`, 'info');
          clicked = true;
          break;
        }
      }
      if (!clicked && optionEls.length > 0) {
        // Pick first option as fallback
        await optionEls[0].click();
        const first = options[0];
        log(`   Dropdown "${label}" fallback: ${first}`, 'info');
      }
      await page.waitForTimeout(400);
    } catch { /* skip */ }
  }

  // ── Checkboxes (availability, bullet-point multi-select options) ──────────
  const checkboxGroups = await page.$$('.jobs-easy-apply-modal fieldset');
  for (const fieldset of checkboxGroups) {
    try {
      const checkboxes = await fieldset.$$('input[type="checkbox"]');
      if (!checkboxes.length) continue;

      const legend = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
      const cbLabels = await Promise.all(checkboxes.map(async cb => {
        const id = await cb.getAttribute('id');
        return page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => '');
      }));

      const answer = getFormAnswer(legend, 'checkbox', cbLabels.filter(Boolean));
      for (let i = 0; i < cbLabels.length; i++) {
        const isChecked = await checkboxes[i].isChecked();
        // Check if this option matches the answer (partial/case-insensitive)
        const matches = (answer || '').toLowerCase().split(',').some(a =>
          cbLabels[i].toLowerCase().includes(a.trim()) || a.trim().includes(cbLabels[i].toLowerCase())
        );
        if (matches && !isChecked) {
          await checkboxes[i].click();
          log(`   Checked "${legend}" → "${cbLabels[i]}"`, 'info');
        }
      }
    } catch { /* skip */ }
  }

  // ── Radio buttons ─────────────────────────────────────────────────────────
  const radioGroups = await page.$$('.jobs-easy-apply-modal fieldset');
  for (const fieldset of radioGroups) {
    try {
      const anyChecked = await fieldset.$('input[type="radio"]:checked');
      if (anyChecked) continue;

      const legend = await fieldset.$eval('legend', el => el.textContent.trim()).catch(() => '');
      const radios = await fieldset.$$('input[type="radio"]');
      const radioLabels = await Promise.all(radios.map(async r => {
        const id = await r.getAttribute('id');
        return page.$eval(`label[for="${id}"]`, el => el.textContent.trim()).catch(() => '');
      }));

      const answer = getFormAnswer(legend, 'radio', radioLabels.filter(Boolean));
      let matched = false;
      // Try exact match first, then partial match
      for (let i = 0; i < radioLabels.length; i++) {
        if (radioLabels[i].toLowerCase() === (answer || '').toLowerCase()) {
          await radios[i].click();
          log(`   Radio "${legend}": ${radioLabels[i]}`, 'info');
          matched = true;
          break;
        }
      }
      if (!matched && answer) {
        for (let i = 0; i < radioLabels.length; i++) {
          if (radioLabels[i].toLowerCase().includes((answer || '').toLowerCase()) ||
              (answer || '').toLowerCase().includes(radioLabels[i].toLowerCase())) {
            await radios[i].click();
            log(`   Radio "${legend}" (partial match): ${radioLabels[i]}`, 'info');
            break;
          }
        }
      }
    } catch { /* skip */ }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLabelFor(page, element) {
  return page.evaluate(el => {
    // Try for attribute on element
    const id = el.id || el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    // Walk up to form element container
    const container = el.closest('.fb-form-element, .jobs-easy-apply-form-element, .fb-dash-form-element, .artdeco-form__group');
    if (container) {
      const lbl = container.querySelector('label, legend, h3, span.visually-hidden');
      if (lbl) return lbl.textContent.trim();
    }
    // Placeholder fallback
    return el.placeholder || el.getAttribute('aria-label') || '';
  }, element).catch(() => '');
}

async function checkLoggedIn(page) {
  return !page.url().includes('/login') &&
    !page.url().includes('/authwall') &&
    !page.url().includes('/uas/login') &&
    await page.$('nav.global-nav').catch(() => null) !== null;
}

async function getText(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) return (await el.textContent()).trim();
    } catch { /* try next */ }
  }
  return '';
}

module.exports = { runLinkedInAgent };
