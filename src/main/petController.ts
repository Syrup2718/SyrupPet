import type { ChatRequest, PetReply, TaskOp, MemoryOp } from '@shared/types'
import { EMOTIONS } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getTaskStore } from './services/tasks/taskStore'
import { getMemoryStore } from './services/memory/memoryStore'
import { WindowManager } from './windows/windowManager'
import { LLMService } from './services/llm/LLMService'
import { EnvironmentService } from './services/environment/environmentService'
import { CursorTracker } from './services/environment/cursorTracker'
import { ProactiveService } from './services/proactive/proactiveService'
import type { ProactiveHint } from './services/proactive/proactiveService'
import { readClipboardText } from './services/clipboard/clipboardService'
import { ClipboardWatcher } from './services/clipboard/clipboardWatcher'
import { getConfigStore } from './config/configStore'

/**
 * The "brain stem": turns user intents (chat / clipboard) into LLM calls and
 * routes the resulting PetReply to the body (pet window) and the chat window.
 * Also wires environment + cursor signals to the pet for ambient liveliness.
 */
export class PetController {
  private inFlight: AbortController | null = null
  private proactive: ProactiveService
  private clipboardWatcher: ClipboardWatcher
  private taskTimer: NodeJS.Timeout | null = null

  constructor(
    private windows: WindowManager,
    private llm: LLMService,
    private environment: EnvironmentService,
    private cursor: CursorTracker
  ) {
    this.proactive = new ProactiveService(
      this.environment,
      (hint) => void this.runProactive(hint),
      () => getConfigStore().get().behaviour.proactive
    )
    // Opt-in: only polls the clipboard when BOTH proactive and watchClipboard
    // are on. On an error-looking change it just offers help (no content sent).
    this.clipboardWatcher = new ClipboardWatcher(
      () => {
        const b = getConfigStore().get().behaviour
        return b.proactive && b.watchClipboard
      },
      () => this.proactive.notifyClipboardError()
    )
  }

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

    // Let her speak up on her own, with restraint (cooldowns live in the service).
    this.proactive.start()
    this.clipboardWatcher.start() // self-gates; reads nothing unless opted in

    // Remind about due to-do items (set via "提醒我30分鐘後…").
    this.taskTimer = setInterval(() => void this.checkDueTasks(), 30_000)
  }

  /** Apply the to-do mutations the LLM emitted alongside a reply. */
  private applyTaskOps(ops: TaskOp[]): void {
    if (!ops.length) return
    const store = getTaskStore()
    for (const op of ops) {
      if (!op.title) continue
      if (op.op === 'add') store.add(op.title, op.dueMinutes)
      else if (op.op === 'done') store.complete(op.title)
      else if (op.op === 'remove') store.remove(op.title)
    }
    this.windows.broadcastTasksUpdated() // refresh the task window if it's open
  }

  /** Apply the memory mutations the LLM emitted alongside a reply. */
  private applyMemoryOps(ops: MemoryOp[]): void {
    if (!ops.length) return
    const store = getMemoryStore()
    for (const op of ops) {
      if (op.op === 'remember') store.remember(op.text)
      else if (op.op === 'forget') store.forget(op.text)
    }
  }

  /** Fire a gentle reminder for the first task whose due time has passed. */
  private async checkDueTasks(): Promise<void> {
    if (this.inFlight) return
    const store = getTaskStore()
    const due = store.listDue(Date.now())
    if (!due.length) return
    const task = due[0]
    store.markReminded(task.id) // mark first so a slow LLM call can't double-fire
    await this.runProactive(
      {
        trigger: 'taskDue',
        note: `提醒：使用者之前請你提醒他「${task.title}」，現在時間到了。請主動、簡短、溫柔地提醒他。`
      },
      true
    )
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

  /**
   * Proactive path: 小漿糖 speaks up on her own. Deliberately quiet — no
   * "thinking" indicator, and any LLM/network failure is swallowed (a proactive
   * line that errors out would just be annoying). Only the pet bubble + chat get
   * the reply if it succeeds.
   */
  private async runProactive(hint: ProactiveHint, force = false): Promise<void> {
    const config = getConfigStore().get()
    if (!force && !config.behaviour.proactive) return
    // Don't talk over an in-flight user request.
    if (this.inFlight) return

    const context = config.behaviour.useEnvironmentContext
      ? await this.environment.getSnapshot()
      : undefined
    try {
      const { reply } = await this.llm.reply({ intent: 'proactive', content: hint.note, context })
      this.emitReply({ intent: 'proactive', content: hint.note }, reply)
    } catch (err) {
      console.warn('[proactive] skipped:', err instanceof Error ? err.message : String(err))
    }
  }

  /** Shared path: call the LLM, broadcast thinking state + result. */
  private async run(req: ChatRequest): Promise<PetReply> {
    // Cancel any previous in-flight request so the latest intent wins.
    this.inFlight?.abort()
    this.inFlight = new AbortController()

    this.windows.sendToPet(IPC.petEmotion, 'thinking')
    this.windows.sendToChat(IPC.chatThinking, true)

    try {
      const { reply, taskOps, memoryOps } = await this.llm.reply(req, this.inFlight.signal)
      this.applyTaskOps(taskOps)
      this.applyMemoryOps(memoryOps)
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

  // --------------------------------------------------------------- test hooks
  /** Trigger one proactive line right now, ignoring cooldowns and the toggle. */
  testProactive(): void {
    void this.runProactive(
      {
        trigger: 'idle',
        note: '（這是一則測試訊息：請主動、自然、簡短地關心使用者一句，證明「主動陪伴」有在運作。）'
      },
      true
    )
  }

  /** Cycle through all emotions on the pet (no LLM) so you can preview a pack. */
  previewEmotions(): void {
    EMOTIONS.forEach((emotion, i) => {
      setTimeout(() => this.windows.sendToPet(IPC.petEmotion, emotion), i * 1200)
    })
  }

  dispose(): void {
    if (this.taskTimer) clearInterval(this.taskTimer)
    this.proactive.stop()
    this.clipboardWatcher.stop()
    this.cursor.stop()
    this.environment.stop()
  }
}
