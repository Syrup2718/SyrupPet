import { clipboard } from 'electron'

/**
 * Clipboard access is *pull-only and user-triggered*. There is deliberately no
 * polling and no clipboard watcher anywhere in this app — the pet only ever sees
 * clipboard content when the user explicitly presses the "analyze clipboard"
 * hotkey (see HotkeyService). This honours the "don't secretly peek" requirement.
 */
export function readClipboardText(): string {
  return clipboard.readText() ?? ''
}
