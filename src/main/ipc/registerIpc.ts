import { ipcMain, app, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppConfig } from '@shared/types'
import type { WindowManager } from '../windows/windowManager'
import type { PetController } from '../petController'
import { getConfigStore } from '../config/configStore'
import { getTaskStore } from '../services/tasks/taskStore'
import { getMemoryStore } from '../services/memory/memoryStore'

/**
 * Wires every renderer<->main channel. Kept in one place so the IPC surface is
 * easy to read and audit.
 */
export function registerIpc(windows: WindowManager, controller: PetController): void {
  // --- pet window control (fire-and-forget) ---
  ipcMain.on(IPC.petDragStart, () => windows.startPetDrag())
  ipcMain.on(IPC.petDragEnd, () => windows.endPetDrag())
  ipcMain.on(IPC.petSetInteractive, (_e, interactive: boolean) => windows.setPetInteractive(interactive))
  ipcMain.on(IPC.petPoke, () => controller.handlePoke())

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
    // Push the new config so live settings (e.g. sound) apply without a restart.
    windows.sendToPet(IPC.configChanged, updated)
    return updated
  })

  // --- tasks ---
  ipcMain.handle(IPC.tasksList, () => getTaskStore().all())
  ipcMain.handle(IPC.tasksAdd, (_e, p: { title: string; dueMinutes?: number }) => {
    const task = getTaskStore().add(p.title, p.dueMinutes, 'manual')
    windows.broadcastTasksUpdated()
    return task
  })
  ipcMain.handle(IPC.tasksComplete, (_e, id: string) => {
    getTaskStore().completeId(id)
    windows.broadcastTasksUpdated()
  })
  ipcMain.handle(IPC.tasksRemove, (_e, id: string) => {
    getTaskStore().removeId(id)
    windows.broadcastTasksUpdated()
  })

  // --- long-term memory (read/clear for the settings viewer) ---
  ipcMain.handle(IPC.memoryList, () => getMemoryStore().list())
  ipcMain.handle(IPC.memoryClear, () => getMemoryStore().clear())

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
