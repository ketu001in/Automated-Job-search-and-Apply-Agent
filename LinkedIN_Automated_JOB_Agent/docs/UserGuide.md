# Your Career Buddy — User Guide

**Version:** 1.0.0 | **Publisher:** Bosket's Tech Ventures

---

## Overview

Your Career Buddy is a free desktop application that automates your LinkedIn job search and Easy Apply process. It reads your CV, learns your preferences, and applies to matching jobs — automatically, on your schedule.

---

## Getting Started

### First Launch

On first launch, the Setup Wizard guides you through 10 steps:

| Step | What to do |
|------|-----------|
| 1. Welcome | Introduction screen — click **Get Started** |
| 2. LinkedIn Account | Enter your LinkedIn email and password |
| 3. Job Search Status | Select your current status (optional) |
| 4. Your CV | Upload PDF/DOCX, paste text, or enter a website URL |
| 5. Personal Details | Review and edit extracted info |
| 6. Address | Enter your address in plain text (no special characters) |
| 7. Education | Review/edit your education history |
| 8. Experience | Review/edit your work history |
| 9. Job Preferences | Set target roles, locations, notice period |
| 10. Travel & Schedule | Set travel preference and automation schedule |

After setup, you land on the **Dashboard**.

---

## CV Upload Tips

> **For best parsing results:** Upload a standard PDF or DOCX resume without heavy graphic design, tables, or images. Text-based CVs extract most accurately.

- **Supported formats:** PDF, DOCX
- **Maximum size:** 5 MB
- **Alternative:** Paste your CV text directly into the text area
- **Portfolio:** Enter your website URL and the agent will scrape your resume section

If the extracted information isn't perfect, **edit it directly** on the review screens — all fields are editable.

---

## Dashboard

The Dashboard is your home screen after setup.

### Status Badge
- **Idle** (blue) — Agent is ready to run
- **Running** (orange, pulsing) — Agent is actively applying
- **Error** (red) — Something went wrong; check the Live Log

### Run Now
Click **Run Now** to immediately start a job application session. The agent will:
1. Open Chromium browser (visible or hidden, per your setting)
2. Log in to LinkedIn using your saved credentials
3. Search for jobs matching your target roles and location
4. Assess each job's compatibility with your profile
5. Fill in Easy Apply forms using your CV data
6. Submit applications

### Last Run Summary
Shows how many jobs were Applied / Skipped / had Errors in the most recent run.

### Live Log
Real-time feed of every action the agent takes. Color coded:
- **Grey** — Info
- **Green** — Success (application submitted)
- **Yellow** — Warning (skipped, no Easy Apply)
- **Red** — Error

---

## Profile & Setup

Access via **My Profile** in the sidebar. Opens the Setup Wizard in edit mode — all previously saved values are pre-filled.

### Address Rules
- Plain text only — no special characters (`"`, `'`, `/`, `\`, `|`, `{`, `}`, `*`, `<`, `>`)
- Use commas to separate components
- Required fields: Address Line 1, City, State, Country, Pincode

### Experience Years Format
When the agent fills a form:
- **Single text box:** `19.02` (years.months — always 2-digit months)
- **Separate Year/Month boxes:** `19` years, `2` months
- **Plain text question:** "19 years and 2 months"

### Notice Period
- Enter the value (e.g., `7`) and unit (`Days` or `Months`)
- "Is it negotiable?" is stored and used when forms ask
- "How soon can you join?" text is used for open-ended joining questions

### Willing to Travel
- If **Yes**, select `25%`, `50%`, or `100%`
- For dropdown forms: agent picks the nearest % option
- For plain text forms: agent uses your exact selection (e.g., "25%")

---

## Settings

### LinkedIn Credentials
Change your email and password anytime. New credentials overwrite the saved ones.

### Automation Schedule
| Frequency | Configuration |
|-----------|--------------|
| Daily | Pick a time (HH:MM, IST) |
| Weekly | Pick a day of week + time |
| Monthly | Pick a day of month + time |

Toggle **Enable Schedule** to turn automatic runs on or off.

### Application Settings
- **Show browser while applying** — Shows Chromium window so you can watch the agent work. Useful for debugging or first-time setup.
- **Max applications per run** — Limits how many jobs are applied to in a single session (default: 20)
- **Minimum compatibility score** — Jobs below this score (1–10) are skipped. Default: 3.

---

## How the Agent Fills Forms

### Form Questions Answered
| Question Type | How Answered |
|---------------|-------------|
| Name, Email, Phone | From your Personal Details |
| Address | From your Address section, plain text |
| Experience years | Calculated from your profile (Years + Months) |
| Skills (yes/no) | Checked against your CV text and skills list |
| Notice period | From your Notice Period setting |
| Location ok? | Matches against your Location Preferences |
| Travel ok? | From your Travel setting |
| Country dropdown | Always selects India (or your profile country) |

### Bullet Points & Checkboxes (Rule C)
When the form asks a yes/no question about a skill or requirement:
1. Agent checks your CV text and skills list for the keyword
2. If the question asks "X years of experience?" and your profile has within 2 years → answers YES
3. If clearly contradicted (>2 year gap) → answers NO
4. If no information found → defaults to **YES**

### Unknown Questions
If the agent encounters a field it doesn't recognize, it picks the first available option (for dropdowns) or leaves it blank (for text fields). Review the Live Log after a run to see what was filled.

---

## System Tray

Your Career Buddy minimizes to the system tray (Windows) / menu bar (macOS) when you close the window.

| Tray Action | Result |
|-------------|--------|
| Double-click icon | Opens dashboard |
| Right-click → Open Dashboard | Opens dashboard |
| Right-click → Run Now | Triggers immediate run |
| Right-click → Quit | Exits completely |

---

## Troubleshooting

### Agent Can't Log In
1. Go to **Settings → LinkedIn Credentials** and re-enter your email/password
2. Enable "Show browser while applying" in Settings
3. Click Run Now — log in manually in the browser window
4. Your session will be saved for future runs

### Application Failed / Form Not Filled
1. Check the Live Log for red error messages
2. Enable "Show browser while applying" to watch in real time
3. Try lowering the Min Compatibility Score to apply to more jobs

### Windows SmartScreen Warning on Install
Click **"More info"** → **"Run anyway"**. This is expected for self-signed builds. The publisher is "Bosket's Tech Ventures".

### Chromium Not Downloading
Ensure you have an internet connection on first launch. The app automatically downloads Chromium (~170 MB) once and caches it.

---

## Data & Privacy

| Data | Where Stored | Sent Anywhere? |
|------|-------------|----------------|
| LinkedIn credentials | Encrypted local config | ❌ Never |
| CV / Resume text | Local config | ❌ Never |
| Job preferences | Local config | ❌ Never |
| Application history | Local JSON file | ❌ Never |

**Your Career Buddy does not require any API keys, cloud accounts, or external services. Everything runs locally on your machine.**

---

## Version History

| Version | Type | Highlights |
|---------|------|-----------|
| 1.0.0 | Free | Initial release — full setup wizard, CV parsing, LinkedIn automation, tray, scheduling |
| 2.0.0 | Free | Planned: self-learning form filling improvements |
| 3.0.0 | Free | Planned: additional job platforms |
| 4.0.0+ | Paid | Planned: premium features, license key required |

---

## License & Ownership

**Your Career Buddy** is owned and published exclusively by **Bosket's Tech Ventures (Ketul Shah)**.

- v1.0 – v3.x: Free to use for personal job searching
- v4.0+: Paid subscription (license key required)
- Redistribution, resale, or modification without permission is prohibited

© 2025-2026 Bosket's Tech Ventures. All Rights Reserved.

---

*For support: support@bosketstechventures.com*
