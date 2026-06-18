import type { ChatMessage } from '@shared/types'

export interface CompletionOptions {
  /** Ask the provider to return a strict JSON object when supported. */
  jsonMode?: boolean
  temperature?: number
  signal?: AbortSignal
}

/**
 * Provider abstraction. Every concrete provider only has to turn a list of
 * messages into a single string completion. Adding Ollama/Anthropic/etc. later
 * means implementing this one method — nothing above this layer changes.
 */
export interface LLMProvider {
  readonly id: string
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
}
