# Nexora — Installation Guide

**Publisher:** Bosket's Tech Ventures  
**Version:** 1.0.0  

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 64-bit | Windows 11 64-bit |
| RAM | 4 GB | 8 GB |
| Disk | 600 MB free | 1.5 GB free |
| Internet | Required | Broadband |
| LinkedIn | Free account | Free account |

> **Note:** Node.js and Chrome are **not** required separately — everything is bundled.

---

## Installation Steps

### Windows

1. **Download** `Nexora Setup 1.0.0.exe`
2. **Double-click** the installer
3. If Windows SmartScreen appears: click **"More info"** → **"Run anyway"**
4. Follow the installer wizard:
   - Accept the license agreement
   - Choose installation folder (default: `C:\Program Files\Nexora\`)
   - Choose shortcut options
5. Click **Install** → **Finish**
6. Nexora launches automatically

### What Happens on First Launch

On first launch, Nexora automatically downloads the Chromium browser (~170 MB):

```
[1:30 PM] 🚀 Launching browser...
[1:30 PM]    Browser ready (persistent profile)
```

This download happens **once only** and takes 1–3 minutes depending on your internet speed. All subsequent launches skip this step.

---

## First-Time Setup Wizard

After installation, complete the 10-step setup:

| Step | What to do |
|------|-----------|
| 1. Welcome | Click "Get Started" |
| 2. LinkedIn Account | Enter your email and password |
| 3. Job Search Status | Select your current status (optional) |
| 4. Your CV | Upload PDF/DOCX (max 5 MB) — fields auto-fill |
| 5. Personal Details | Review/edit auto-filled information |
| 6. Address | Enter your current address (plain text only) |
| 7. Education | Review/edit education history |
| 8. Work Experience | Review/edit job history |
| 9. Job Preferences | Set target roles, locations, CTC, notice period |
| 10. Travel & Schedule | Set travel preference and auto-run schedule |

Click **"Save & Launch Dashboard"** — setup is complete and saved permanently.

---

## Manual Browser Setup (if auto-download fails)

Open PowerShell or Command Prompt and run:

```powershell
cd "C:\Program Files\Nexora"
npm run setup-browser
```

---

## Uninstalling

**Control Panel** → Programs → "Nexora" → Uninstall

Or: **Start Menu** → "Nexora" folder → "Uninstall Nexora"

User data (profile, cookies) is stored separately in AppData and is **not** deleted on uninstall. To fully remove all data:

```powershell
Remove-Item -Recurse "$env:APPDATA\nexora"
Remove-Item -Recurse "$env:LOCALAPPDATA\ms-playwright"
```

---

## Data Locations

| Data | Location |
|------|----------|
| App config & profile | `%APPDATA%\nexora\nexora-config.json` |
| Browser session | `%APPDATA%\nexora\browser-profile\` |
| Chromium browser | `%LOCALAPPDATA%\ms-playwright\` |

---

*© 2025–2026 Bosket's Tech Ventures. All rights reserved.*
