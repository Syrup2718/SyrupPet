import type {
  AppConfig,
  ChatRequest,
  CursorPoint,
  Emotion,
  EnvironmentSnapshot,
  PetReply
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
    /** Move the pet window's top-left to a screen (DIP) coordinate during drag. */
    dragMove(x: number, y: number): void
    dragEnd(): void
    setInteractive(interactive: boolean): void
    onSay(cb: (reply: PetReply) => void): Unsubscribe
    onEmotion(cb: (emotion: Emotion | string) => void): Unsubscribe
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
  }
  window: {
    close(): void
  }
}
