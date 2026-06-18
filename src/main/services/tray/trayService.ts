import { Tray, Menu, nativeImage } from 'electron'
import type { NativeImage } from 'electron'

export interface TrayHandlers {
  onToggleChat: () => void
  onTogglePet: () => void
  onOpenSettings: () => void
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
        { label: '👀 顯示/隱藏桌寵', click: handlers.onTogglePet },
        { type: 'separator' },
        { label: '⚙️  設定 (Settings)', click: handlers.onOpenSettings },
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

/** A tiny caramel-coloured dot drawn as a data URL — placeholder tray icon. */
function makeIcon(): NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="#E8A04B" stroke="#B5722B" stroke-width="1.5"/>
    <circle cx="5.5" cy="7" r="1.2" fill="#3a2a1a"/>
    <circle cx="10.5" cy="7" r="1.2" fill="#3a2a1a"/>
  </svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}
