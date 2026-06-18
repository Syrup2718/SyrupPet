import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppConfig, PetReply } from '@shared/types'
import type { SyrupApi } from '@shared/api'

/**
 * The single, typed API surface exposed to every renderer as `window.syrup`.
 * Renderers never touch ipcRenderer directly — this is the whole trust boundary.
 * The shape is defined by SyrupApi (in shared) so renderers type-check against
 * the contract, not this electron-bound implementation.
 */
const api: SyrupApi = {
  pet: {
    dragStart: () => ipcRenderer.send(IPC.petDragStart),
    dragEnd: () => ipcRenderer.send(IPC.petDragEnd),
    setInteractive: (interactive) => ipcRenderer.send(IPC.petSetInteractive, interactive),
    onSay: (cb) => listen(IPC.petSay, cb),
    onEmotion: (cb) => listen(IPC.petEmotion, cb),
    onCursor: (cb) => listen(IPC.cursorMove, cb),
    onEnvironment: (cb) => listen(IPC.environmentUpdate, cb)
  },
  chat: {
    send: (message): Promise<PetReply> => ipcRenderer.invoke(IPC.chatSend, message),
    analyzeClipboard: (): Promise<PetReply | null> => ipcRenderer.invoke(IPC.clipboardAnalyze),
    onReply: (cb) => listen(IPC.chatReply, cb),
    onThinking: (cb) => listen(IPC.chatThinking, cb)
  },
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke(IPC.configSet, patch)
  },
  window: {
    close: () => ipcRenderer.send(IPC.windowClose)
  }
}

/** Subscribe helper that returns an unsubscribe function. */
function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('syrup', api)
