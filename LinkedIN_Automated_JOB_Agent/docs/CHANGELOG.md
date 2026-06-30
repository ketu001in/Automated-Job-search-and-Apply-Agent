# Nexora — Changelog

All notable changes to Nexora are documented here.  
Publisher: Bosket's Tech Ventures

---

## [1.0.0] — June 2026 — Initial Release

### New Features
- **10-step Setup Wizard** — guided onboarding with CV auto-parse
- **CV Parsing** — PDF and DOCX support, auto-fills all profile fields
- **LinkedIn Easy Apply Automation** — fully automated multi-step form filling
- **Self-Learning Question Bank** — remembers Q&A pairs from every successful application
- **IT / Non-IT Profile Category** — auto-detected from CV, drives job search targeting
- **Date-Grouped Dashboard** — jobs grouped by Today / Yesterday / This Week / Older
- **Report Export** — CSV, XLS (formatted), and PDF with proper table columns
- **Persistent Browser Session** — login + 2FA only required once
- **Mobile 2FA Handler** — auto-clicks "Send Again" every 30 seconds, waits up to 5 min
- **Schedule Automation** — Daily / Weekly / Monthly preset schedules
- **System Tray** — runs silently in background, accessible from tray
- **My Profile Editor** — single scrollable page with section jump links
- **Address Validation** — rejects special characters for form compatibility
- **Notice Period Smart Fill** — returns pure numbers (no unit text) for numeric fields
- **Consent/Agreement Auto-Yes** — automatically accepts all consent checkboxes
- **Multiple Radio Groups Fix** — answers all radio question groups on a page
- **Validation Error Detection** — skips stuck jobs after 2 failed attempts with logged reason
- **Cumulative Stats** — all-time applied/skipped/errors count never resets
- **Profile Category in Sidebar** — shows IT/Non-IT badge in Dashboard sidebar
- **Dark Professional UI** — charcoal theme (#0d0d0d) with blue accent, smooth transitions
- **Nexora Branding** — full brand refresh with inline SVG logo throughout

### Technical
- Electron 28.3.3 + Node.js 18 (bundled)
- Playwright 1.47+ with persistent browser profile
- electron-store 8.x with encrypted local config
- CV parsing: pdf-parse (PDF) + mammoth (DOCX) + axios/cheerio (URL)
- Zero recurring cost — no API keys, no cloud services

---

## [2.0.0] — Planned (Free)

- Improved self-learning accuracy
- Naukri.com job search support
- Indeed job search support
- Better CV parsing for graphic-design CVs
- Bulk job export improvements

## [3.0.0] — Planned (Free)

- Multi-platform job search (Monster, Shine, etc.)
- Interview scheduling integration
- Application tracking analytics

## [4.0.0+] — Planned (Paid)

- License key system active
- Cloud sync across devices
- AI-powered cover letter generation
- Premium support

---

*© 2025–2026 Bosket's Tech Ventures. All rights reserved.*
