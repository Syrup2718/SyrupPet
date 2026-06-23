import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { loadRenderer } from './loadRenderer'
import appIconPath from '../../../resources/icon.png?asset'

const PET_WIDTH = 280
const PET_HEIGHT = 440

const AUX_TITLES = {
  chat: '小漿糖 — Chat',
  settings: '小漿糖 — 設定',
  tasks: '小漿糖 — 代辦'
} as const

/**
 * Owns the three windows and the pet-specific window behaviours that can only
 * be done from the main process: frameless transparency, always-on-top,
 * manual dragging and click-through.
 */
export class WindowManager {
  pet: BrowserWindow | null = null
  chat: BrowserWindow | null = null
  settings: BrowserWindow | null = null
  tasks: BrowserWindow | null = null

  private preloadPath: string
  private dragTimer: NodeJS.Timeout | null = null
  private sulkTimer: NodeJS.Timeout | null = null

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

  /** Poked too much: she storms off (hides), then sulks back ~25s later. */
  sulkPet(): void {
    if (!this.pet || this.pet.isDestroyed()) return
    // Hiding mid-interaction can swallow the mouseup that ends a drag, leaving
    // the cursor-follow running so she'd "stick to the mouse" on her return.
    // Stop any drag and have the renderer drop its drag/lift/swing state.
    this.endPetDrag()
    this.pet.setIgnoreMouseEvents(true, { forward: true })
    this.pet.webContents.send(IPC.petReset)
    this.pet.hide()
    if (this.sulkTimer) clearTimeout(this.sulkTimer)
    this.sulkTimer = setTimeout(() => {
      this.sulkTimer = null
      if (!this.pet || this.pet.isDestroyed()) return
      this.pet.show()
      this.pet.webContents.send(IPC.petReset)
      this.pet.webContents.send(IPC.petSay, {
        text: '…哼,我回來了啦。下次別戳那麼用力。',
        emotion: 'confused',
        action: 'idle'
      })
    }, 25_000)
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
   * Manual drag: the renderer signals drag-start; we capture the offset between
   * the cursor and the window origin, then follow the global cursor until
   * drag-end. This works even though the window is click-through elsewhere.
   */
  startPetDrag(): void {
    if (!this.pet || this.dragTimer) return
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = this.pet.getPosition()
    const offsetX = cursor.x - wx
    const offsetY = cursor.y - wy
    let lastX = cursor.x
    let lastY = cursor.y
    this.dragTimer = setInterval(() => {
      if (!this.pet) return
      const p = screen.getCursorScreenPoint()
      // Only move when the cursor actually moved. Re-issuing setPosition every
      // tick lets DPI rounding / 1px cursor jitter make the window creep on its
      // own even while the cursor is held still.
      if (p.x === lastX && p.y === lastY) return
      lastX = p.x
      lastY = p.y
      this.pet.setPosition(p.x - offsetX, p.y - offsetY)
    }, 16)
  }

  endPetDrag(): void {
    if (this.dragTimer) clearInterval(this.dragTimer)
    this.dragTimer = null
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

  // ------------------------------------------------------------ tasks window
  openTasks(): void {
    if (this.tasks && !this.tasks.isDestroyed()) {
      this.tasks.show()
      this.tasks.focus()
      return
    }
    this.tasks = this.createAuxWindow('tasks', 400, 560)
  }

  broadcastTasksUpdated(): void {
    if (this.tasks && !this.tasks.isDestroyed()) this.tasks.webContents.send(IPC.tasksUpdated)
  }

  /** Push the latest status to whoever's showing it: the pet and the settings page. */
  broadcastStatus(status: unknown): void {
    if (this.pet && !this.pet.isDestroyed()) this.pet.webContents.send(IPC.statusChanged, status)
    if (this.settings && !this.settings.isDestroyed()) this.settings.webContents.send(IPC.statusChanged, status)
  }

  private createAuxWindow(entry: 'chat' | 'settings' | 'tasks', width: number, height: number): BrowserWindow {
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
      title: AUX_TITLES[entry],
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        sandbox: false
      }
    })
    loadRenderer(win, entry)
    win.on('closed', () => {
      if (entry === 'chat') this.chat = null
      else if (entry === 'settings') this.settings = null
      else this.tasks = null
    })
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
