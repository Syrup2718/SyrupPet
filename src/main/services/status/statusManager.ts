import type { EnvironmentSnapshot, PetStatus, StatusEvent } from '@shared/types'
import type { EnvironmentService } from '../environment/environmentService'
import { getStatusStore } from './statusStore'
import { applyEvent, ambientStep } from './statusRules'

const TICK_MS = 60_000 // ambient decay/drift runs once a minute — smooth, not jumpy
const BREAK_RESETS_AFTER = 180 // 3 min idle ends a continuous-work streak

/**
 * Owns the live status: runs the gentle decay/drift tick, folds in interaction
 * events and ambient signals from the environment, and pushes every change out
 * to the UI. When the feature is switched off it freezes (no ticks, no events,
 * no pushes) but still serves the stored values for display.
 */
export class StatusManager {
  private readonly store = getStatusStore()
  private timer: NodeJS.Timeout | null = null
  private lastSnap: EnvironmentSnapshot | null = null
  private workStart: number | null = null
  private readonly envHandler = (snap: EnvironmentSnapshot): void => this.onEnvironment(snap)

  constructor(
    /** Live read of config.behaviour.status so the toggle applies at once. */
    private readonly isEnabled: () => boolean,
    /** Broadcast the latest status to the renderers (pet + settings). */
    private readonly emit: (status: PetStatus) => void
  ) {}

  start(env: EnvironmentService): void {
    env.on('update', this.envHandler)
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
    // Push the initial (already catch-up-decayed) status so the UI starts in sync.
    if (this.isEnabled()) this.emit(this.store.get())
  }

  stop(env?: EnvironmentService): void {
    if (env) env.off('update', this.envHandler)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Latest status (served even when the feature is off, for the settings view). */
  get(): PetStatus {
    return this.store.get()
  }

  reset(): PetStatus {
    const next = this.store.reset()
    if (this.isEnabled()) this.emit(next)
    return next
  }

  /** Fold in a discrete interaction (poke / chat / praise / task / …). */
  record(event: StatusEvent): void {
    if (!this.isEnabled()) return
    const next = applyEvent(this.store.get(), event, Date.now())
    this.emit(this.store.set(next))
  }

  /** Keep the work-streak clock and the latest snapshot; ambient applies on tick. */
  private onEnvironment(snap: EnvironmentSnapshot): void {
    if (snap.idleSeconds >= BREAK_RESETS_AFTER) this.workStart = null
    else if (snap.isActive && this.workStart === null) this.workStart = Date.now()
    this.lastSnap = snap
  }

  private tick(): void {
    if (!this.isEnabled()) return
    const now = Date.now()
    const streak = this.workStart ? now - this.workStart : 0
    const next = ambientStep(this.store.get(), this.lastSnap, streak, new Date(now).getHours(), now)
    this.emit(this.store.set(next))
  }
}
