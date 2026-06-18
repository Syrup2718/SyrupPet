import { screen } from 'electron'
import { EventEmitter } from 'node:events'
import type { CursorPoint } from '@shared/types'

export type { CursorPoint }

/**
 * Polls the global cursor position so the pet's eyes/expression can react even
 * when the cursor is *near but not over* the (mostly transparent) pet window.
 *
 * 50ms (~20fps) is smooth enough for eye-follow without burning CPU. Can be
 * paused via config.behaviour.followCursor.
 */
export class CursorTracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private readonly intervalMs: number

  constructor(intervalMs = 50) {
    super()
    this.intervalMs = intervalMs
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      const p = screen.getCursorScreenPoint()
      this.emit('move', p as CursorPoint)
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
