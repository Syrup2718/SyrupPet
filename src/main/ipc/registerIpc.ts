import { ipcMain, app, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppConfig } from '@shared/types'
import type { WindowManager } from '../windows/windowManager'
import type { PetController } from '../petController'
import { getConfigStore } from '../config/configStore'

/**
 * Wires every renderer<->main channel. Kept in one place so the IPC surface is
 * easy to read and audit.
 */
export function registerIpc(windows: WindowManager, controller: PetController): void {
  // --- pet window control (fire-and-forget) ---
  ipcMain.on(IPC.petDragStart, () => windows.startPetDrag())
  ipcMain.on(IPC.petDragMove, (_e, pos: { x: number; y: number }) => windows.movePet(pos.x, pos.y))
  ipcMain.on(IPC.petDragEnd, () => windows.endPetDrag())
  ipcMain.on(IPC.petSetInteractive, (_e, interactive: boolean) => windows.setPetInteractive(interactive))

  // --- chat / LLM (request/response) ---
  ipcMain.handle(IPC.chatSend, (_e, message: string) => controller.handleChat(message))
  ipcMain.handle(IPC.clipboardAnalyze, () => controller.handleClipboard())

  // --- config ---
  ipcMain.handle(IPC.configGet, () => getConfigStore().get())
  ipcMain.handle(IPC.configSet, (_e, patch: Partial<AppConfig>) => {
    const updated = getConfigStore().set(patch)
    applyStartupSetting(updated)
    // Switching character pack takes effect immediately by reloading the pet.
    if (patch.character) windows.reloadPet()
    return updated
  })

  // --- generic window close ---
  ipcMain.on(IPC.windowClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}

/** Reflect launch-on-startup config into the OS login-items list. */
export function applyStartupSetting(config: AppConfig): void {
  app.setLoginItemSettings({
    openAtLogin: config.launchOnStartup,
    path: process.execPath
  })
}
