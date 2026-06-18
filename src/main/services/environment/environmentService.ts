import { powerMonitor } from 'electron'
import { EventEmitter } from 'node:events'
import type { EnvironmentSnapshot } from '@shared/types'
import { getForegroundWindow } from './foregroundWindow'

/**
 * Periodically samples a privacy-conscious snapshot of "what the user is roughly
 * doing" and emits it.
 *
 * Privacy boundaries (v1, by design):
 *  - Idle time comes from Electron's powerMonitor.getSystemIdleTime() — an
 *    OS-level "seconds since last input" counter. It is NOT a keylogger and
 *    carries no information about *what* was typed.
 *  - Foreground info is window metadata only (process + title bar).
 *  - Nothing here is sent to the LLM automatically; the snapshot is only used
 *    as optional context when the user actively chats (see config.behaviour).
 */
export class EnvironmentService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private readonly intervalMs: number
  private readonly idleThresholdSeconds = 60
  private last: EnvironmentSnapshot | null = null

  constructor(intervalMs = 5000) {
    super()
    this.intervalMs = intervalMs
  }

  start(): void {
    if (this.timer) return
    void this.sample()
    this.timer = setInterval(() => void this.sample(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Latest snapshot (or a freshly taken one if none yet). */
  async getSnapshot(): Promise<EnvironmentSnapshot> {
    return this.last ?? (await this.sample())
  }

  private async sample(): Promise<EnvironmentSnapshot> {
    const idleSeconds = powerMonitor.getSystemIdleTime()
    const fg = await getForegroundWindow().catch(() => ({ process: null, title: null }))

    const snapshot: EnvironmentSnapshot = {
      activeProcess: fg.process,
      activeTitle: fg.title,
      idleSeconds,
      isActive: idleSeconds < this.idleThresholdSeconds,
      timestamp: Date.now()
    }

    this.last = snapshot
    this.emit('update', snapshot)
    return snapshot
  }
}
