import { execFile } from 'node:child_process'

export interface ForegroundWindowInfo {
  process: string | null
  title: string | null
}

/**
 * Reads the current foreground window's process name and title on Windows.
 *
 * Implemented with a short PowerShell snippet using Win32 GetForegroundWindow /
 * GetWindowText rather than a native node addon — this keeps the project free of
 * compiled dependencies (nothing to rebuild per Electron/Node version).
 *
 * Privacy: this only returns window *metadata* (app + title bar). It never reads
 * window contents or keystrokes.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
}
"@
$h = [FgWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[void][FgWin]::GetWindowText($h, $sb, $sb.Capacity)
$pid2 = 0
[void][FgWin]::GetWindowThreadProcessId($h, [ref]$pid2)
$proc = (Get-Process -Id $pid2).ProcessName
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output ($proc + "|" + $sb.ToString())
`.trim()

export function getForegroundWindow(): Promise<ForegroundWindowInfo> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 64 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve({ process: null, title: null })
          return
        }
        const line = stdout.toString().trim()
        const sep = line.indexOf('|')
        if (sep === -1) {
          resolve({ process: line || null, title: null })
          return
        }
        const proc = line.slice(0, sep).trim()
        const title = line.slice(sep + 1).trim()
        resolve({
          process: proc ? `${proc}.exe` : null,
          title: title || null
        })
      }
    )
  })
}
