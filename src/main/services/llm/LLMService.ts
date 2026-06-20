import type { AppConfig, ChatMessage, ChatRequest, PetReply, TaskOp } from '@shared/types'
import { ACTIONS, EMOTIONS } from '@shared/types'
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider'
import type { LLMProvider } from './LLMProvider'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { getTaskStore } from '../tasks/taskStore'

/** A parsed LLM turn: the pet's reply plus any to-do mutations it requested. */
export interface LLMReply {
  reply: PetReply
  taskOps: TaskOp[]
}

/**
 * Orchestrates a chat turn: builds messages from the persona + history + the
 * request, calls the active provider, then parses the structured PetReply.
 *
 * Keeps a small rolling history so the pet has short-term memory within a
 * session. (Long-term memory is a planned extension — see README roadmap.)
 */
export class LLMService {
  private getConfig: () => AppConfig
  private history: ChatMessage[] = []
  private readonly maxHistory = 12

  constructor(getConfig: () => AppConfig) {
    this.getConfig = getConfig
  }

  private buildProvider(config: AppConfig): LLMProvider {
    const providerConfig = config.providers[config.provider]
    // For now every provider is OpenAI-compatible. Swap on `config.provider`
    // here when a non-compatible provider (e.g. native Anthropic) is added.
    return new OpenAICompatibleProvider(providerConfig)
  }

  /** Resets the in-session conversation memory. */
  clearHistory(): void {
    this.history = []
  }

  async reply(req: ChatRequest, signal?: AbortSignal): Promise<LLMReply> {
    const config = this.getConfig()
    const provider = this.buildProvider(config)

    const systemPrompt = buildSystemPrompt(config.persona)
    const userPrompt = buildUserPrompt(req, getTaskStore().listOpen())

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.history,
      { role: 'user', content: userPrompt }
    ]

    const raw = await provider.complete(messages, { jsonMode: true, signal })
    const reply = parsePetReply(raw)
    const taskOps = parseTaskOps(raw)

    // Only commit real conversational turns to memory (not clipboard one-offs).
    if (req.intent === 'chat') {
      this.pushHistory({ role: 'user', content: req.content })
      this.pushHistory({ role: 'assistant', content: reply.text })
    }

    return { reply, taskOps }
  }

  private pushHistory(msg: ChatMessage): void {
    this.history.push(msg)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }
  }
}

/**
 * Robustly turns the model's text into a PetReply. Models sometimes wrap JSON
 * in ```json fences or add stray prose, so we extract the first {...} block and
 * fall back to a safe default rather than ever throwing at the user.
 */
export function parsePetReply(raw: string): PetReply {
  const fallback: PetReply = { text: raw.trim() || '……（我好像有點當機了）', emotion: 'confused', action: 'idle' }

  const jsonText = extractJsonObject(raw)
  if (!jsonText) return fallback

  try {
    const obj = JSON.parse(jsonText) as Partial<PetReply>
    const text = typeof obj.text === 'string' && obj.text.trim() ? obj.text.trim() : fallback.text
    const emotion = EMOTIONS.includes(obj.emotion as never) ? obj.emotion! : 'normal'
    const action = ACTIONS.includes(obj.action as never) ? obj.action! : 'idle'
    return { text, emotion, action }
  } catch {
    return fallback
  }
}

/** Pull any `tasks` mutations out of the same reply JSON. Tolerant — bad shapes
 *  are skipped rather than thrown, so a malformed op never breaks the chat. */
export function parseTaskOps(raw: string): TaskOp[] {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return []
  try {
    const obj = JSON.parse(jsonText) as { tasks?: unknown }
    if (!Array.isArray(obj.tasks)) return []
    const ops: TaskOp[] = []
    for (const item of obj.tasks) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (o.op !== 'add' && o.op !== 'done' && o.op !== 'remove') continue
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      if (!title) continue // every op needs a title to act on
      const dueMinutes = typeof o.dueMinutes === 'number' && o.dueMinutes > 0 ? o.dueMinutes : undefined
      ops.push({ op: o.op, title, dueMinutes })
    }
    return ops
  } catch {
    return []
  }
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}
