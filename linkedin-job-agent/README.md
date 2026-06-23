# LinkedIn Job Agent 🤖

Automated LinkedIn job search + Easy Apply agent powered by Claude AI.
Runs every morning at **10:00 AM IST**, searches for PM/PMO roles in Bengaluru posted in the last 24 hours, scores each job for compatibility, and auto-submits Easy Apply applications.

---

## What It Does

1. Searches LinkedIn for: `Senior Program Manager`, `Program Manager`, `PMO`
2. Filters: Bengaluru · Past 24 hours · Easy Apply only
3. Asks Claude to score each job (1–10) against your CV
4. Skips jobs below your minimum score (default: 6/10)
5. Fills Easy Apply forms automatically (uses Claude for unknown questions)
6. Submits the application
7. Shows everything in a real-time web dashboard

---

## Quick Start (Laptop)

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org) installed
- A Claude API key from [console.anthropic.com](https://console.anthropic.com)

### 2. Install
```bash
cd linkedin-job-agent
npm install
npm run setup      # downloads Playwright's Chromium browser (~150 MB, one-time)
```

### 3. Configure
```bash
cp .env.example .env
```
Open `.env` and set:
```
CLAUDE_API_KEY=sk-ant-your-key-here
HEADLESS=false        # show browser window for first login
```

### 4. First Run (with visible browser for LinkedIn login)
```bash
npm start
```
- Open **http://localhost:3000** in your browser
- A Chromium window will open automatically
- **Log in to LinkedIn** in that window (your normal credentials)
- The agent saves your session cookie — you won't need to log in again
- Click **"Run Now"** on the dashboard to test immediately

### 5. Subsequent Runs
- The agent uses the saved session (no browser window needed)
- Change `HEADLESS=false` → `HEADLESS=true` in `.env` for silent background mode
- The agent will auto-run at **10 AM IST** every day while `npm start` is running

---

## Access From Mobile

Since this is a web app, you can open the dashboard from your phone while the agent runs on your laptop.

1. Find your laptop's local IP:
   - Windows: `ipconfig` → look for IPv4 Address (e.g. `192.168.1.10`)
2. On your phone (same Wi-Fi), open: `http://192.168.1.10:3000`
3. You'll see the live dashboard including logs and applied jobs

---

## Deploy to Cloud (Always-On, Mobile-Friendly)

To run 24/7 without keeping your laptop on, deploy to [Railway](https://railway.app) (free tier available):

### Railway Deployment
1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set environment variables in Railway dashboard:
   - `CLAUDE_API_KEY` = your key
   - `HEADLESS` = `true`
   - `LINKEDIN_EMAIL` = your LinkedIn email
   - `LINKEDIN_PASSWORD` = your LinkedIn password
4. Railway gives you a public URL — open it on any device (laptop or mobile)

> **Note on LinkedIn credentials:** Railway runs headlessly (no visible browser). Providing `LINKEDIN_EMAIL` + `LINKEDIN_PASSWORD` lets the agent log in automatically. LinkedIn may occasionally ask for 2FA — the agent will log the checkpoint and skip that run; you'll need to log in via a browser and re-save cookies if this happens.

---

## Configuration

Edit `profile.js` to update your details:

| Field | Default | What it controls |
|---|---|---|
| `yearsOfExperience` | 19 | Filled in experience fields |
| `currentCTC` | 30 | Current CTC (LPA) |
| `expectedCTC` | 45 | Expected CTC (LPA) |
| `noticePeriod` | 7 | Notice period (days) |
| `minCompatibilityScore` | 6 | Skip jobs below this score (1–10) |
| `searchQueries` | `['Senior PM', 'PM', 'PMO']` | Job titles to search |

---

## Files

```
linkedin-job-agent/
├── server.js          ← Express server + scheduler
├── linkedin.js        ← Playwright automation
├── claude.js          ← Claude API (assessment + form answers)
├── profile.js         ← Your CV data (edit this)
├── package.json
├── .env               ← Your secrets (never commit this)
├── .env.example       ← Template
├── linkedin_session.json  ← Saved LinkedIn cookies (auto-created)
├── last_report.json       ← Last run results (auto-created)
└── public/
    └── index.html     ← Dashboard UI
```

---

## Important Notes

- **LinkedIn ToS**: Automation may violate LinkedIn's Terms of Service. Use responsibly.
- **Account safety**: If LinkedIn detects unusual activity it may lock your account temporarily. The agent uses realistic browser headers and pacing to reduce detection risk.
- **2FA / CAPTCHA**: If LinkedIn shows a security check, the agent will pause and log a warning. Run with `HEADLESS=false` to complete it manually.
- **Resume**: The agent uses whichever resume is already saved/selected in your LinkedIn profile (it does not upload a new file on each run).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Session expired` | Set `HEADLESS=false`, restart, log in manually |
| `No jobs found` | LinkedIn may have changed its HTML — check logs for selector errors |
| `Assessment unavailable` | Check `CLAUDE_API_KEY` in `.env` |
| Agent applies to wrong jobs | Increase `minCompatibilityScore` in `profile.js` |
