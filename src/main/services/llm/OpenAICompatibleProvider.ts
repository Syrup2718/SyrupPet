import type { ChatMessage, LLMProviderConfig } from '@shared/types'
import type { CompletionOptions, LLMProvider } from './LLMProvider'

/**
 * Works against any OpenAI-compatible `/chat/completions` endpoint.
 * This single class covers OpenAI, DeepSeek, Ollama (`/v1`) and most local
 * inference servers (LM Studio, vLLM, llama.cpp server, ...) — they differ only
 * by baseUrl, apiKey and model name, which all come from config.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string
  private readonly config: LLMProviderConfig

  constructor(config: LLMProviderConfig) {
    this.id = config.id
    this.config = config
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
    if (!this.config.baseUrl) {
      throw new Error(`Provider "${this.id}" has no baseUrl configured.`)
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0.8,
      stream: false
    }
    if (options.jsonMode) {
      // Supported by OpenAI & DeepSeek; harmless/ignored by most others.
      body.response_format = { type: 'json_object' }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 500)}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('LLM response did not contain a message.')
    }
    return content
  }
}
