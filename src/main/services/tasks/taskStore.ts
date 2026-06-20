import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Task } from '@shared/types'

/**
 * Tiny JSON-file to-do store, sibling to ConfigStore. Lives in userData so it
 * survives reinstalls. Dependency-free (no SQLite) to keep the v1 surface small.
 */
class TaskStore {
  private filePath: string
  private tasks: Task[]
  private seq = 0

  constructor() {
    this.filePath = join(app.getPath('userData'), 'tasks.json')
    this.tasks = this.load()
  }

  private load(): Task[] {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        if (Array.isArray(raw)) return raw as Task[]
      }
    } catch (err) {
      console.error('[tasks] failed to read, starting empty:', err)
    }
    return []
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2), 'utf-8')
    } catch (err) {
      console.error('[tasks] failed to persist:', err)
    }
  }

  private nextId(): string {
    this.seq++
    return `task_${Date.now().toString(36)}_${this.seq}`
  }

  add(title: string, dueMinutes?: number, source: Task['source'] = 'chat'): Task {
    const now = Date.now()
    const task: Task = {
      id: this.nextId(),
      title: title.trim(),
      status: 'todo',
      dueAt: dueMinutes && dueMinutes > 0 ? now + dueMinutes * 60_000 : null,
      createdAt: now,
      completedAt: null,
      reminded: false,
      source
    }
    this.tasks.push(task)
    this.persist()
    return task
  }

  /** Mark the best title match among open tasks as done. Returns it, or null. */
  complete(title: string): Task | null {
    const t = this.matchOpen(title)
    if (!t) return null
    t.status = 'done'
    t.completedAt = Date.now()
    this.persist()
    return t
  }

  remove(title: string): Task | null {
    const t = this.matchOpen(title)
    if (!t) return null
    this.tasks = this.tasks.filter((x) => x.id !== t.id)
    this.persist()
    return t
  }

  /** Loose match (exact -> substring either way) over open tasks. */
  private matchOpen(title: string): Task | null {
    const q = title.trim().toLowerCase()
    if (!q) return null
    const open = this.tasks.filter((t) => t.status === 'todo')
    return (
      open.find((t) => t.title.toLowerCase() === q) ??
      open.find((t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())) ??
      null
    )
  }

  listOpen(): Task[] {
    return this.tasks.filter((t) => t.status === 'todo')
  }

  /** Open tasks whose due time has passed and that haven't been reminded yet. */
  listDue(now: number): Task[] {
    return this.tasks.filter(
      (t) => t.status === 'todo' && t.dueAt !== null && t.dueAt <= now && !t.reminded
    )
  }

  markReminded(id: string): void {
    const t = this.tasks.find((x) => x.id === id)
    if (t) {
      t.reminded = true
      this.persist()
    }
  }
}

let instance: TaskStore | null = null
/** Lazily created so it's only built after `app` is ready. */
export function getTaskStore(): TaskStore {
  if (!instance) instance = new TaskStore()
  return instance
}
