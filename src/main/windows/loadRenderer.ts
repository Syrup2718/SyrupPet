import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

/**
 * Loads a renderer entry (pet/chat/settings) in both dev and prod.
 * In dev, electron-vite serves the renderer from a dev server and exposes its
 * URL via ELECTRON_RENDERER_URL. In prod we load the built HTML from disk.
 */
export function loadRenderer(win: BrowserWindow, entry: 'pet' | 'chat' | 'settings'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/${entry}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${entry}/index.html`))
  }
}
