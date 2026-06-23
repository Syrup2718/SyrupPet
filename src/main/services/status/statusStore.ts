import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { PetStatus } from '@shared/types'
import { ambientStep, initialStatus, sanitize } from './statusRules'

/** How many minutes of "she carried on living while the app was closed" to
 *  catch up on load. Capped so a week-long gap doesn't fast-forward forever. */
const MAX_CATCHUP_MINUTES = 180

/**
 * Persists 小漿糖's live status in userData/status.json. Tiny and dependency-free,
 * exactly like the memory/tasks stores. On load it applies a bounded amount of
 * "catch-up" decay for the time the app was closed, so she drifts toward calm
 * baseline rather than resuming frozen at last session's numbers.
 */
export class PetStatusStore {
  private filePath: string
  private status: PetStatus

  constructor() {
    this.filePath = join(app.getPath('userData'), 'status.json')
    this.status = this.load()
  }

  private load(): PetStatus {
    const now = Date.now()
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        const restored = sanitize(raw, now)
        return this.catchUp(restored, now)
      }
    } catch (err) {
      console.error('[status] failed to read, starting fresh:', err)
    }
    return initialStatus(now)
  }

  /** Drift toward baseline for the (bounded) minutes the app was closed. */
  private catchUp(status: PetStatus, now: number): PetStatus {
    const minutes = Math.min(MAX_CATCHUP_MINUTES, Math.floor((now - status.updatedAt) / 60_000))
    let s = status
    const hour = new Date(now).getHours()
    for (let i = 0; i < minutes; i++) s = ambientStep(s, null, 0, hour, now)
    return s
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.status, null, 2), 'utf-8')
    } catch (err) {
      console.error('[status] failed to persist:', err)
    }
  }

  get(): PetStatus {
    return this.status
  }

  /** Replace the whole status (callers pass an already-computed next state). */
  set(next: PetStatus): PetStatus {
    this.status = next
    this.persist()
    return this.status
  }

  reset(): PetStatus {
    this.status = initialStatus(Date.now())
    this.persist()
    return this.status
  }
}

let instance: PetStatusStore | null = null
/** Lazily created so it's only built after `app` is ready. */
export function getStatusStore(): PetStatusStore {
  if (!instance) instance = new PetStatusStore()
  return instance
}
