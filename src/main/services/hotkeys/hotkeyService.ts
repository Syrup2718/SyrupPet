import { globalShortcut } from 'electron'
import type { AppConfig } from '@shared/types'

export interface HotkeyHandlers {
  onToggleChat: () => void
  onAnalyzeClipboard: () => void
  onTogglePet: () => void
}

/**
 * Registers the global shortcuts defined in config. Re-registering (e.g. after
 * the user changes a hotkey in settings) is just register() again — it clears
 * the old bindings first.
 */
export class HotkeyService {
  private handlers: HotkeyHandlers

  constructor(handlers: HotkeyHandlers) {
    this.handlers = handlers
  }

  register(config: AppConfig): void {
    this.unregister()
    const { hotkeys } = config
    this.safeRegister(hotkeys.toggleChat, this.handlers.onToggleChat)
    this.safeRegister(hotkeys.analyzeClipboard, this.handlers.onAnalyzeClipboard)
    this.safeRegister(hotkeys.togglePet, this.handlers.onTogglePet)
  }

  private safeRegister(accelerator: string, handler: () => void): void {
    if (!accelerator) return
    try {
      const ok = globalShortcut.register(accelerator, handler)
      if (!ok) console.warn(`[hotkeys] failed to register "${accelerator}" (already in use?)`)
    } catch (err) {
      console.warn(`[hotkeys] invalid accelerator "${accelerator}":`, err)
    }
  }

  unregister(): void {
    globalShortcut.unregisterAll()
  }
}
