# Your Career Buddy — Product Requirements Document

**Product Name:** Your Career Buddy  
**Publisher / Company:** Bosket's Tech Ventures  
**Document Type:** Functional Requirements Specification  
**Version:** 1.0  
**Date:** 2026-06-25  
**Owner:** Ketul Shah (Bosket's Tech Ventures)  

---

## 1. Product Overview

**Your Career Buddy** is a fully distributable, installable Windows and macOS desktop application that automates LinkedIn job searching and Easy Apply applications. It is intelligent, fully customizable per user, and can be distributed to anyone with a laptop, internet connection, and a LinkedIn account — at zero cost to the creator or the end user for v1 through v3.

---

## 2. Core Design Principles

- **Zero Cost (v1–v3):** No API keys, no paid services, no subscriptions needed by the user or the publisher.
- **Zero Investment (Creator):** Built entirely using free and open-source tools.
- **Fully Customizable:** Every user can configure the tool with their own profile, CV, preferences, and schedule.
- **Persistent Config:** At every start, all previously entered values are pre-loaded. Changes update the config.
- **Professional Distribution:** Packaged as a signed installable (Windows .exe NSIS installer, macOS .dmg), versioned.
- **Scalable Architecture:** License key infrastructure built now, dormant for free versions, activatable for v4+.

---

## 3. Platform Targets

| Version | Windows | macOS | Linux |
|---------|---------|-------|-------|
| v1.x    | ✅      | ✅    | ❌    |
| v4+ (future) | ✅ | ✅  | TBD   |

---

## 4. Versioning & Monetization Plan

| Version | Type | License Key Required | Platforms |
|---------|------|---------------------|-----------|
| v1.x | Free | No | LinkedIn only |
| v2.x | Free | No | LinkedIn + improvements |
| v3.x | Free | No | LinkedIn + self-learning |
| v4+ | Paid | Yes (sold/distributed by Bosket's Tech Ventures) | Multi-platform |

**Ownership & Release Authority:** All version releases, licensing decisions, and pricing are solely the responsibility of **Bosket's Tech Ventures (Ketul Shah)**.

---

## 5. Setup & Onboarding (First-Run Wizard)

### 5.1 Welcome Screen
- App name, version, publisher branding
- "Get Started" CTA

### 5.2 LinkedIn Credentials
- Email field
- Password field (secure, masked)
- Credentials saved to encrypted local config
- At every run: if credentials already set, they are pre-filled; new input overwrites config
- Engaging loading messages shown while verifying/saving

### 5.3 Job Search Status (Informational, Non-Mandatory)
Dropdown with options:
- Actively Searching
- Exploring the Right Match
- Open to the Right Opportunity
- Just Checking
> Agent runs regardless of selection — this is informational metadata only.

### 5.4 CV / Resume Upload
- **Formats accepted:** PDF, DOCX
- **Max size:** 5 MB
- **Also accepted:** Plain text paste into a textarea
- **Also accepted:** Portfolio / personal website URL (agent scrapes it for resume section)
- **On upload/paste/URL:** Agent parses and auto-extracts all profile fields
- **Prompt shown to user before upload:**
  > *"For best results, upload a standard PDF or DOCX resume without heavy graphic design, tables, or images. Text-based CVs parse most accurately. You can review and edit all extracted data on the following screens."*

### 5.5 Personal Details (Pre-filled from CV, Editable)
- First Name (Mandatory)
- Last Name (Mandatory)
- Email (Mandatory)
- Phone Number (Mandatory, with country code selector)
- LinkedIn Profile URL
- Portfolio / Website URL

### 5.6 Address (Pre-filled from CV if available, Editable)
- Address Line 1 (Mandatory)
- Address Line 2 (Optional)
- City (Mandatory)
- County / State (Mandatory)
- Country (Mandatory)
- Pincode / Zipcode (Mandatory)
- **Validation:** No special characters allowed (`"`, `'`, `<`, `>`, `\`, `/`, `|`, `{`, `}`, `*`). If entered, a prompt is shown: *"Please enter your address in plain text only. Special characters are not accepted."*
- Address is used in form filling as plain text: `{line1}, {line2}, {city}, {state}, {country} - {pincode}`

### 5.7 Education Details (Pre-filled from CV, Editable, Multiple Entries)
Each entry:
- Institution / College / University Name
- Degree / Qualification
- Field of Study
- Start Year
- End Year (or "Ongoing")
- Grade (% or CGPA, with toggle)

### 5.8 Work Experience (Pre-filled from CV, Editable, Multiple Entries)
Each entry:
- Company Name (Mandatory)
- Job Title / Designation (Mandatory)
- Start Date (Month + Year, Mandatory)
- End Date (Month + Year; disabled/non-mandatory if "Currently working here" is checked)
- "Currently working here" checkbox
- Brief description (optional)

### 5.9 Target Roles
- Free-text input: roles separated by commas
- Mandatory: at least 1 role
- Example: `Senior Program Manager, TPM, PMO Lead`

### 5.10 Location Preferences
- LinkedIn-style typeahead dropdown
- Max 3 selections
- Pre-defined list of major Indian + global cities with search filter
- "Remote" is always an option

### 5.11 Total Years of Experience
- Two dropdowns: **Years** (0–50) and **Months** (0–11)
- Combined value used dynamically in form filling:
  - Single text box: `19.2` (years.months)
  - Separate year/month fields: filled individually
  - Text question: `"19 years and 2 months"`

### 5.12 Notice Period
- Numeric input (how many)
- Dropdown unit: **Days / Months**
- Is it negotiable? **Yes / No** toggle
- Free text: "How soon can you join if offered?" (e.g., "Immediately", "Within 2 weeks")

### 5.13 Willing to Travel?
- Yes / No toggle
- If Yes → Dropdown: **25% / 50% / 100%**
- Form filling behavior:
  - If form has % dropdown: pick nearest match
  - If form has plain text: use exact selected % (e.g., `"25%"`)

---

## 6. Intelligent Form Filling Logic

### 6.1 General Rules
- All data from the profile is used to answer form questions
- Questions are matched using keyword analysis against the profile
- Unknown questions default to a safe fallback

### 6.2 Bullet Point (Radio Button) Answers
- If question asks about a skill/technology from the CV → answer based on CV data
- If question asks "X years of experience?" → compare with profile experience years
- **Threshold rule:** Answer YES unless CV data clearly contradicts by more than 2 years
- **Default:** YES if no match found in CV

### 6.3 Checkbox Answers
- Same logic as bullet points
- Check all applicable options that match CV skills

### 6.4 "How soon can you join?" → Use Notice Period joining availability text

### 6.5 Location Questions → Use Location Preferences list

### 6.6 Travel Questions → Use travel preference + %

---

## 7. Dashboard

- Agent status (Idle / Running / Error)
- Run Now button (manual trigger)
- Last run summary: Applied / Skipped / Errors
- Next scheduled run
- Live log feed (real-time)
- Applied jobs list with company, title, score, link

---

## 8. Settings

### 8.1 LinkedIn Credentials
- Editable email + password

### 8.2 Automation Schedule
- Presets: Daily / Weekly / Monthly
- Time picker
- Weekly: day selector
- Monthly: date selector

### 8.3 Application Settings
- Show browser while applying (headless toggle)
- Max applications per run
- Min compatibility score threshold

### 8.4 About & License
- App version
- Publisher info
- License type (Free / Paid)
- License key field (dormant for v1–v3)

---

## 9. Distribution & Packaging

### 9.1 Windows
- NSIS installer (.exe)
- Publisher: Bosket's Tech Ventures
- Self-signed certificate (removes generic SmartScreen warning)
- Custom install wizard with branding

### 9.2 macOS
- DMG installer
- Publisher identity set in build config

### 9.3 Prerequisites (bundled or clearly stated)
- Chromium (downloaded automatically by Playwright on first run)
- Node.js (bundled inside app via Electron — no user install needed)
- Internet connection
- LinkedIn account

### 9.4 Installer includes README.txt with:
- Version info
- What's new
- Prerequisites
- How to run / first-time setup
- Troubleshooting
- Contact / Support

---

## 10. Future Versions (Roadmap)

| Version | Planned Feature |
|---------|----------------|
| v2.x | Self-learning (improves answers based on feedback) |
| v3.x | Multi-platform search (Naukri, Indeed, etc.) |
| v4+ | Paid tier, license key system active, premium features |

---

## 11. Technology Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Desktop App | Electron 28+ | Free |
| Packaging | electron-builder | Free |
| Browser Automation | Playwright (Chromium) | Free |
| PDF Parsing | pdf-parse | Free |
| DOCX Parsing | mammoth | Free |
| Web Scraping | axios + cheerio | Free |
| Config Storage | electron-store | Free |
| Scheduling | node-cron | Free |
| UI | Vanilla HTML/CSS/JS | Free |

**Total recurring cost: ₹0 / $0**

---

*Document prepared by Claude Code (claude-sonnet-4-6) on behalf of Bosket's Tech Ventures.*  
*All rights reserved © 2025–2026 Bosket's Tech Ventures.*
