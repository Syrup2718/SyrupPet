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
  }
  launchOnStartup: boolean
}
