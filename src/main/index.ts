import { app, BrowserWindow } from 'electron'
import { WindowManager } from './windows/windowManager'
import { LLMService } from './services/llm/LLMService'
import { EnvironmentService } from './services/environment/environmentService'
import { CursorTracker } from './services/environment/cursorTracker'
import { PetController } from './petController'
import { HotkeyService } from './services/hotkeys/hotkeyService'
import { TrayService } from './services/tray/trayService'
import { getConfigStore } from './config/configStore'
import { registerIpc, applyStartupSetting } from './ipc/registerIpc'

let windows: WindowManager
let controller: PetController
let hotkeys: HotkeyService
let tray: TrayService

// Single-instance guard. If another instance already holds the lock we must
// quit *without* running any setup — otherwise this second process would try to
// register the same global hotkeys (failing) and lock the same cache dir,
// producing confusing "already in use" / cache-access-denied errors.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  tray = new TrayService()

  app.whenReady().then(() => {
  const config = getConfigStore().get()

  windows = new WindowManager(WindowManager.defaultPreloadPath())
  const llm = new LLMService(() => getConfigStore().get())
  const environment = new EnvironmentService()
  const cursor = new CursorTracker()
  controller = new PetController(windows, llm, environment, cursor)

  registerIpc(windows, controller)

  windows.createPet()
  controller.start()

  hotkeys = new HotkeyService({
    onToggleChat: () => windows.toggleChat(),
    onAnalyzeClipboard: () => void controller.handleClipboard(),
    onTogglePet: () => windows.togglePet()
  })
  hotkeys.register(config)

  tray.create({
    onToggleChat: () => windows.toggleChat(),
    onTogglePet: () => windows.togglePet(),
    onOpenSettings: () => windows.openSettings(),
    onTestProactive: () => controller.testProactive(),
    onPreviewEmotions: () => controller.previewEmotions(),
    onQuit: () => app.quit()
  })

  applyStartupSetting(config)

  app.on('second-instance', () => windows.togglePet())

    // On macOS-style reactivation (harmless on Windows): ensure a pet exists.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.createPet()
    })
  })

  // The pet is a tray app — keep running when all windows are closed/hidden.
  app.on('window-all-closed', () => {
    // intentionally do nothing on Windows; quitting happens via the tray menu.
  })

  app.on('will-quit', () => {
    hotkeys?.unregister()
    controller?.dispose()
    tray?.destroy()
  })
}
