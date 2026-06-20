import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { loadRenderer } from './loadRenderer'
import appIconPath from '../../../resources/icon.png?asset'

const PET_WIDTH = 280
const PET_HEIGHT = 440

/**
 * Owns the three windows and the pet-specific window behaviours that can only
 * be done from the main process: frameless transparency, always-on-top,
 * manual dragging and click-through.
 */
export class WindowManager {
  pet: BrowserWindow | null = null
  chat: BrowserWindow | null = null
  settings: BrowserWindow | null = null

  private preloadPath: string

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
  }

  // -------------------------------------------------------------- pet window
  createPet(): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      width: PET_WIDTH,
      height: PET_HEIGHT,
      x: workArea.x + workArea.width - PET_WIDTH - 40,
      y: workArea.y + workArea.height - PET_HEIGHT - 40,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        sandbox: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // Start click-through; the renderer toggles it on when the cursor is over
    // the actual character pixels (see pet:set-interactive).
    win.setIgnoreMouseEvents(true, { forward: true })
    loadRenderer(win, 'pet')
    win.on('closed', () => (this.pet = null))
    this.pet = win
    return win
  }

  /** Reload the pet renderer (e.g. after the character pack changed). */
  reloadPet(): void {
    if (this.pet && !this.pet.isDestroyed()) this.pet.webContents.reload()
  }

  togglePet(): void {
    if (!this.pet) {
      this.createPet()
      return
    }
    if (this.pet.isVisible()) this.pet.hide()
    else this.pet.show()
  }

  /** Renderer reports whether the cursor is over interactive pixels. */
  setPetInteractive(interactive: boolean): void {
    if (!this.pet) return
    this.pet.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  /**
   * Manual drag. The renderer drives it via movePet() using its own pointer
   * events (screenX/clientX), which share the same DIP coordinate space as
   * setPosition — so the grabbed point stays glued to the cursor with no creep
   * or DPI slippage. startPetDrag/endPetDrag are just lifecycle markers.
   */
  startPetDrag(): void {
    /* renderer-driven; nothing to set up in main */
  }

  /** Set the pet window's top-left to a screen (DIP) coordinate. */
  movePet(x: number, y: number): void {
    if (this.pet && !this.pet.isDestroyed()) this.pet.setPosition(Math.round(x), Math.round(y))
  }

  endPetDrag(): void {
    /* renderer-driven; nothing to tear down in main */
  }

  // ------------------------------------------------------------- chat window
  toggleChat(): void {
    if (this.chat && !this.chat.isDestroyed()) {
      if (this.chat.isVisible()) this.chat.hide()
      else {
        this.chat.show()
        this.chat.focus()
      }
      return
    }
    this.chat = this.createAuxWindow('chat', 380, 520)
  }

  showChat(): void {
    if (!this.chat || this.chat.isDestroyed()) this.chat = this.createAuxWindow('chat', 380, 520)
    this.chat.show()
    this.chat.focus()
  }

  // --------------------------------------------------------- settings window
  openSettings(): void {
    if (this.settings && !this.settings.isDestroyed()) {
      this.settings.show()
      this.settings.focus()
      return
    }
    this.settings = this.createAuxWindow('settings', 460, 600)
  }

  private createAuxWindow(entry: 'chat' | 'settings', width: number, height: number): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      width,
      height,
      x: workArea.x + workArea.width - width - 40,
      y: workArea.y + Math.max(40, workArea.height - height - 380),
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: false,
      alwaysOnTop: true,
      icon: appIconPath,
      title: entry === 'chat' ? '小漿糖 — Chat' : '小漿糖 — 設定',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        sandbox: false
      }
    })
    loadRenderer(win, entry)
    if (entry === 'chat') win.on('closed', () => (this.chat = null))
    else win.on('closed', () => (this.settings = null))
    return win
  }

  // ----------------------------------------------------------------- helpers
  /** Send an event to the pet renderer if it exists. */
  sendToPet(channel: string, payload?: unknown): void {
    if (this.pet && !this.pet.isDestroyed()) this.pet.webContents.send(channel, payload)
  }

  sendToChat(channel: string, payload?: unknown): void {
    if (this.chat && !this.chat.isDestroyed()) this.chat.webContents.send(channel, payload)
  }

  static defaultPreloadPath(): string {
    return join(__dirname, '../preload/index.js')
  }
}
