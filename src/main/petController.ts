import type { ChatRequest, PetReply } from '@shared/types'
import { IPC } from '@shared/ipc'
import { WindowManager } from './windows/windowManager'
import { LLMService } from './services/llm/LLMService'
import { EnvironmentService } from './services/environment/environmentService'
import { CursorTracker } from './services/environment/cursorTracker'
import { readClipboardText } from './services/clipboard/clipboardService'
import { getConfigStore } from './config/configStore'

/**
 * The "brain stem": turns user intents (chat / clipboard) into LLM calls and
 * routes the resulting PetReply to the body (pet window) and the chat window.
 * Also wires environment + cursor signals to the pet for ambient liveliness.
 */
export class PetController {
  private inFlight: AbortController | null = null

  constructor(
    private windows: WindowManager,
    private llm: LLMService,
    private environment: EnvironmentService,
    private cursor: CursorTracker
  ) {}

  start(): void {
    const config = getConfigStore().get()

    // Eye-follow / proximity: stream global cursor position to the pet.
    if (config.behaviour.followCursor) {
      this.cursor.on('move', (p) => this.windows.sendToPet(IPC.cursorMove, p))
      this.cursor.start()
    }

    // Ambient awareness (kept local; only used as context on explicit chat).
    this.environment.on('update', (snap) => this.windows.sendToPet(IPC.environmentUpdate, snap))
    this.environment.start()
  }

  /** Handle a user chat message from the chat window. */
  async handleChat(message: string): Promise<PetReply> {
    const config = getConfigStore().get()
    const context = config.behaviour.useEnvironmentContext
      ? await this.environment.getSnapshot()
      : undefined
    return this.run({ intent: 'chat', content: message, context })
  }

  /** Handle the "analyze clipboard" hotkey — user-triggered only. */
  async handleClipboard(): Promise<PetReply | null> {
    const text = readClipboardText().trim()
    if (!text) {
      const empty: PetReply = { text: '咦?剪貼簿是空的，先複製一段文字再叫我看看吧!', emotion: 'confused', action: 'shake' }
      this.emitReply({ intent: 'clipboard', content: '' }, empty)
      return empty
    }
    this.windows.showChat()
    return this.run({ intent: 'clipboard', content: text })
  }

  /** Shared path: call the LLM, broadcast thinking state + result. */
  private async run(req: ChatRequest): Promise<PetReply> {
    // Cancel any previous in-flight request so the latest intent wins.
    this.inFlight?.abort()
    this.inFlight = new AbortController()

    this.windows.sendToPet(IPC.petEmotion, 'thinking')
    this.windows.sendToChat(IPC.chatThinking, true)

    try {
      const reply = await this.llm.reply(req, this.inFlight.signal)
      this.emitReply(req, reply)
      return reply
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[llm] reply failed:', message)
      const errorReply: PetReply = {
        text: `嗚...我連不上大腦 (LLM)。檢查一下設定裡的 API Key 或網路?\n(${message.slice(0, 120)})`,
        emotion: 'confused',
        action: 'shake'
      }
      this.emitReply(req, errorReply)
      return errorReply
    } finally {
      this.windows.sendToChat(IPC.chatThinking, false)
      this.inFlight = null
    }
  }

  private emitReply(req: ChatRequest, reply: PetReply): void {
    this.windows.sendToPet(IPC.petSay, reply)
    this.windows.sendToChat(IPC.chatReply, { request: req, reply })
  }

  dispose(): void {
    this.cursor.stop()
    this.environment.stop()
  }
}
