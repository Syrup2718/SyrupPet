import type {
  AppConfig,
  ChatRequest,
  CursorPoint,
  Emotion,
  EnvironmentSnapshot,
  PetReply,
  PetStatus,
  StatusEvent,
  Task,
  Memory
} from './types'

/** Unsubscribe handle returned by every `on*` listener. */
export type Unsubscribe = () => void

/**
 * The `window.syrup` contract. Declared in shared (electron-free) so renderers
 * can type-check against it without importing the preload implementation.
 * The preload module implements this interface.
 */
export interface SyrupApi {
  pet: {
    dragStart(): void
    dragEnd(): void
    setInteractive(interactive: boolean): void
    /** Signal that the user poked her (left-click) — may trigger an LLM line. */
    poke(): void
    /** Poked way too much — she storms off (hides) and returns on her own. */
    sulk(): void
    /** Report an interaction (e.g. a poke) so the brain can nudge her status. */
    reportStatus(event: StatusEvent): void
    onSay(cb: (reply: PetReply) => void): Unsubscribe
    onEmotion(cb: (emotion: Emotion | string) => void): Unsubscribe
    /** Main asks the renderer to drop any drag/lift/swing state (e.g. on hide). */
    onReset(cb: () => void): Unsubscribe
    onCursor(cb: (p: CursorPoint) => void): Unsubscribe
    onEnvironment(cb: (snap: EnvironmentSnapshot) => void): Unsubscribe
  }
  chat: {
    send(message: string): Promise<PetReply>
    analyzeClipboard(): Promise<PetReply | null>
    onReply(cb: (data: { request: ChatRequest; reply: PetReply }) => void): Unsubscribe
    onThinking(cb: (thinking: boolean) => void): Unsubscribe
  }
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
    /** Fired to the pet after a settings save, with the merged config. */
    onChanged(cb: (config: AppConfig) => void): Unsubscribe
  }
  tasks: {
    list(): Promise<Task[]>
    add(title: string, dueMinutes?: number): Promise<Task>
    complete(id: string): Promise<void>
    remove(id: string): Promise<void>
    /** Fired when the list changed elsewhere (e.g. via chat) — refetch. */
    onUpdated(cb: () => void): Unsubscribe
  }
  memory: {
    list(): Promise<Memory[]>
    clear(): Promise<void>
  }
  status: {
    get(): Promise<PetStatus>
    /** Reset every value back to the starting baseline. */
    reset(): Promise<PetStatus>
    /** Fired whenever any status value changes (decay tick or interaction). */
    onChanged(cb: (status: PetStatus) => void): Unsubscribe
  }
  window: {
    close(): void
  }
}
