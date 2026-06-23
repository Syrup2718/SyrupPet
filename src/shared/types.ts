/**
 * Shared types used across the main process, preload bridge and renderers.
 * This is the single source of truth for the "contract" between the AI brain
 * (LLM) and the character body (renderer).
 */

/** Emotions the character can display. Maps 1:1 to an expression asset. */
export const EMOTIONS = [
  'normal',
  'happy',
  'confused',
  'angry',
  'thinking',
  'sleepy',
  'shy',
  'excited',
  'love',
  'sad'
] as const
export type Emotion = (typeof EMOTIONS)[number]

/** Short physical actions the character can play as a one-shot animation. */
export const ACTIONS = [
  'idle',
  'wave',
  'jump',
  'nod',
  'shake',
  'sleep'
] as const
export type Action = (typeof ACTIONS)[number]

/**
 * The structured reply we ask the LLM to produce. The pet uses every field:
 * `text` goes into the speech bubble, `emotion` switches the expression and
 * `action` plays a one-shot animation — this is what gives the pet "life".
 */
export interface PetReply {
  text: string
  emotion: Emotion
  action: Action
}

/** A single turn in the chat history. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Why a reply was requested — lets the system prompt adapt its tone. */
export type ReplyIntent = 'chat' | 'clipboard' | 'proactive'

export interface ChatRequest {
  intent: ReplyIntent
  /** The user's message (chat) or the clipboard content (clipboard intent). */
  content: string
  /** Optional environment snapshot the pet may reference (never raw keystrokes). */
  context?: EnvironmentSnapshot
}

/**
 * A privacy-conscious snapshot of "what the user is roughly doing".
 * NOTE: never contains typed text — only activity signals and window metadata.
 */
export interface EnvironmentSnapshot {
  /** Foreground app process name, e.g. "Code.exe". */
  activeProcess: string | null
  /** Foreground window title, e.g. "index.ts — SyrupPet". */
  activeTitle: string | null
  /** Seconds since the last keyboard/mouse input (OS-level, no key contents). */
  idleSeconds: number
  /** True when there has been recent input activity. */
  isActive: boolean
  /** Unix epoch ms when this snapshot was taken. */
  timestamp: number
}

/** A point in global screen coordinates (used for cursor-follow). */
export interface CursorPoint {
  x: number
  y: number
}

/**
 * 小漿糖's live inner state — what makes her feel like a real companion rather
 * than a stateless face. Every value is 0–100. Persisted in userData/status.json
 * and decays gently toward a baseline so changes never feel abrupt.
 */
export const STATUS_KEYS = ['mood', 'energy', 'affection', 'focus', 'concern'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

export interface PetStatus {
  /** 心情:開不開心,影響表情與語氣。 */
  mood: number
  /** 能量:精神狀態。低→容易 sleepy,高→活潑。 */
  energy: number
  /** 親密度:和使用者的熟悉程度。互動會慢慢提升,長期不理會慢慢掉。 */
  affection: number
  /** 專注度:使用者是否正在專注工作。高→少打擾,安靜陪伴。 */
  focus: number
  /** 擔心值:對使用者狀態的擔心。深夜/久坐/卡住會上升。 */
  concern: number
  /** Epoch ms of the last change (used to apply catch-up decay after a restart). */
  updatedAt: number
}

/**
 * A discrete interaction that nudges the status. The numeric effect of each
 * event lives in main (StatusRules) — the renderer only reports *what happened*,
 * keeping the body/brain split intact.
 */
export type StatusEvent =
  | 'poke' // 單純點一下
  | 'pokeStorm' // 狂點
  | 'chat' // 聊天
  | 'praised' // 被誇獎(LLM 偵測)
  | 'thanked' // 被道謝(LLM 偵測)
  | 'taskComplete' // 完成代辦
  | 'clipboardError' // 幫忙看錯誤

/** A status reaction the LLM may emit in its reply JSON (like task/memory ops). */
export interface StatusOp {
  op: 'praised' | 'thanked'
}

/** A local to-do item. Persisted in userData/tasks.json. */
export type TaskStatus = 'todo' | 'done'
export interface Task {
  id: string
  title: string
  status: TaskStatus
  /** Epoch ms when it should be reminded, or null for an undated to-do. */
  dueAt: number | null
  createdAt: number
  completedAt: number | null
  /** Whether a due reminder has already fired. */
  reminded: boolean
  source: 'chat' | 'manual'
}

/** A task mutation the LLM may emit in its reply JSON (alongside text/emotion). */
export interface TaskOp {
  op: 'add' | 'done' | 'remove'
  /** Title to add, or text to match an existing open task for done/remove. */
  title?: string
  /** For add: remind me in this many minutes (optional). */
  dueMinutes?: number
}

/** A durable fact the pet remembers about the user across sessions. */
export interface Memory {
  id: string
  /** Short third-person fact, e.g. "使用者在做一個叫 SyrupPet 的桌寵專案". */
  text: string
  createdAt: number
}

/** A memory mutation the LLM may emit in its reply JSON. */
export interface MemoryOp {
  op: 'remember' | 'forget'
  text: string
}

/** Supported LLM provider kinds. All are OpenAI-compatible HTTP APIs. */
export type LLMProviderId = 'openai' | 'deepseek' | 'ollama' | 'custom'

export interface LLMProviderConfig {
  id: LLMProviderId
  /** Base URL of the OpenAI-compatible endpoint (without trailing /chat/completions). */
  baseUrl: string
  apiKey: string
  model: string
}

export interface AppConfig {
  provider: LLMProviderId
  providers: Record<LLMProviderId, LLMProviderConfig>
  /** Character pack folder name under public/characters. */
  character: string
  /** Persona/system-prompt flavour text injected into every request. */
  persona: string
  hotkeys: {
    toggleChat: string
    analyzeClipboard: string
    togglePet: string
  }
  behaviour: {
    /** Whether the eyes/expression react to the global cursor position. */
    followCursor: boolean
    /** Whether the pet may use the environment snapshot as chat context. */
    useEnvironmentContext: boolean
    /** Pixels: how close the cursor must be to trigger the "curious" reaction. */
    proximityRadius: number
    /** Whether the pet may speak up on its own (idle/overwork/late-night/app). */
    proactive: boolean
    /**
     * Opt-in (default false): poll the clipboard so the pet can *offer* to help
     * when it looks like an error was copied. Even when on, the content is NOT
     * sent to the LLM for the offer — only the manual hotkey reads + analyses it.
     */
    watchClipboard: boolean
    /** Play short synthesized sound effects on click / when she speaks. */
    sound: boolean
    /** Sound effect volume, 0–100. */
    soundVolume: number
    /** Let her remember durable facts about you across sessions. */
    memory: boolean
    /** Run the live status system (mood/energy/affection/focus/concern). */
    status: boolean
  }
  launchOnStartup: boolean
}
