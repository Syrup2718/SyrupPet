import { Tray, Menu, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import trayIconPath from '../../../../resources/tray.png?asset'

export interface TrayHandlers {
  onToggleChat: () => void
  onOpenTasks: () => void
  onTogglePet: () => void
  onOpenSettings: () => void
  onTestProactive: () => void
  onPreviewEmotions: () => void
  onQuit: () => void
}

/**
 * System tray icon + context menu. The icon is generated in-memory so the v1
 * has no binary asset dependency; swap in a real .ico/.png later if desired.
 */
export class TrayService {
  private tray: Tray | null = null

  create(handlers: TrayHandlers): void {
    this.tray = new Tray(makeIcon())
    this.tray.setToolTip('小漿糖 SyrupPet')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '💬 開啟聊天 (Chat)', click: handlers.onToggleChat },
        { label: '📋 代辦清單', click: handlers.onOpenTasks },
        { label: '👀 顯示/隱藏桌寵', click: handlers.onTogglePet },
        { type: 'separator' },
        { label: '⚙️  設定 (Settings)', click: handlers.onOpenSettings },
        { type: 'separator' },
        { label: '🔔 測試:主動說一句', click: handlers.onTestProactive },
        { label: '🎭 測試:輪播 10 表情', click: handlers.onPreviewEmotions },
        { type: 'separator' },
        { label: '結束 (Quit)', click: handlers.onQuit }
      ])
    )
    this.tray.on('click', handlers.onToggleChat)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

/** The syrup-jar tray icon (32px PNG, copied to the build output by electron-vite). */
function makeIcon(): NativeImage {
  return nativeImage.createFromPath(trayIconPath)
}
