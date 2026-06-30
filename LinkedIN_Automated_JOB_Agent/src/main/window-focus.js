/**
 * window-focus.js — "Bring the agent's Chrome window to front."
 *
 * LIMITATION (by design, not a bug): Electron has no cross-process API to
 * focus a window owned by another application. Playwright's Chromium runs as
 * a separate OS process, so we can't call something like `chromeWindow.focus()`
 * the way we can with our own BrowserWindows.
 *
 * VERIFIED FIX #1 (2026-06-30): A plain SetForegroundWindow call from a
 * background process is REJECTED by Windows — anti-focus-stealing protection.
 * Worked around with the standard AttachThreadInput technique.
 *
 * VERIFIED FIX #2 (2026-06-30): The first fix still didn't work end-to-end
 * because the multi-line script was passed via PowerShell's `-Command` flag
 * as a single command-line string — this is fragile for long scripts with
 * embedded C# (Add-Type) containing many quotes/braces; Windows command-line
 * argument serialization mangled it silently (no error, but the foreground
 * window never actually changed). Switched to writing the script to a real
 * .ps1 file and invoking with `-File`, which is robust regardless of script
 * complexity. Verified working end-to-end: SetForegroundWindow returns true
 * AND the OS foreground window handle actually changes to Chrome.
 *
 * Matches the Chrome process whose window title contains "LinkedIn". If the
 * user also has their own personal Chrome open with a LinkedIn tab, this
 * could theoretically pick the wrong window — acceptable trade-off for a
 * best-effort convenience feature, not a precision-guaranteed one.
 */

const { execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const SCRIPT_CONTENT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NexoraWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$proc = Get-Process -Name chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'LinkedIn' } | Select-Object -First 1
if (-not $proc) {
  $proc = Get-Process -Name chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if ($proc) {
  $hWnd = $proc.MainWindowHandle
  $foreground = [NexoraWin32]::GetForegroundWindow()
  $fgThread = 0
  [void][NexoraWin32]::GetWindowThreadProcessId($foreground, [ref]$fgThread)
  $curThread = [NexoraWin32]::GetCurrentThreadId()
  $targetThread = 0
  [void][NexoraWin32]::GetWindowThreadProcessId($hWnd, [ref]$targetThread)

  [void][NexoraWin32]::AttachThreadInput($curThread, $fgThread, $true)
  [void][NexoraWin32]::AttachThreadInput($targetThread, $fgThread, $true)
  [void][NexoraWin32]::BringWindowToTop($hWnd)
  [void][NexoraWin32]::ShowWindow($hWnd, 9)
  [void][NexoraWin32]::SetForegroundWindow($hWnd)
  [void][NexoraWin32]::AttachThreadInput($curThread, $fgThread, $false)
  [void][NexoraWin32]::AttachThreadInput($targetThread, $fgThread, $false)
}
`;

// Written once, reused on every call — avoids repeated disk I/O per click.
const scriptPath = path.join(os.tmpdir(), 'nexora-focus-chrome.ps1');

function ensureScriptFile() {
  try {
    if (!fs.existsSync(scriptPath)) {
      fs.writeFileSync(scriptPath, SCRIPT_CONTENT, 'utf8');
    }
  } catch (e) {
    console.error('[window-focus] could not write helper script:', e.message);
  }
}

function focusChrome() {
  ensureScriptFile();
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    (err, stdout, stderr) => {
      if (err) console.error('[window-focus] focusChrome failed:', err.message, stderr);
    }
  );
}

module.exports = { focusChrome };
