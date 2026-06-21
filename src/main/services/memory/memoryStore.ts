import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Memory } from '@shared/types'

const MAX_MEMORIES = 50

/**
 * Long-term memory: short durable facts about the user, persisted in
 * userData/memory.json. Local-only — used solely as context on the user's own
 * chat turns, never auto-sent anywhere. Capped so it can't grow unbounded.
 */
class MemoryStore {
  private filePath: string
  private memories: Memory[]
  private seq = 0

  constructor() {
    this.filePath = join(app.getPath('userData'), 'memory.json')
    this.memories = this.load()
  }

  private load(): Memory[] {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        if (Array.isArray(raw)) return raw as Memory[]
      }
    } catch (err) {
      console.error('[memory] failed to read, starting empty:', err)
    }
    return []
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.memories, null, 2), 'utf-8')
    } catch (err) {
      console.error('[memory] failed to persist:', err)
    }
  }

  /** Add a fact, skipping near-duplicates; trims to the most recent MAX. */
  remember(text: string): Memory | null {
    const t = text.trim()
    if (!t) return null
    const lower = t.toLowerCase()
    if (this.memories.some((m) => m.text.toLowerCase() === lower)) return null

    this.seq++
    const memory: Memory = { id: `mem_${Date.now().toString(36)}_${this.seq}`, text: t, createdAt: Date.now() }
    this.memories.push(memory)
    if (this.memories.length > MAX_MEMORIES) {
      this.memories = this.memories.slice(-MAX_MEMORIES)
    }
    this.persist()
    return memory
  }

  /** Forget by loose text match (exact -> substring either way). */
  forget(text: string): boolean {
    const q = text.trim().toLowerCase()
    if (!q) return false
    const before = this.memories.length
    this.memories = this.memories.filter(
      (m) => !(m.text.toLowerCase() === q || m.text.toLowerCase().includes(q) || q.includes(m.text.toLowerCase()))
    )
    if (this.memories.length === before) return false
    this.persist()
    return true
  }

  list(): Memory[] {
    return [...this.memories].sort((a, b) => b.createdAt - a.createdAt)
  }

  clear(): void {
    this.memories = []
    this.persist()
  }
}

let instance: MemoryStore | null = null
/** Lazily created so it's only built after `app` is ready. */
export function getMemoryStore(): MemoryStore {
  if (!instance) instance = new MemoryStore()
  return instance
}
