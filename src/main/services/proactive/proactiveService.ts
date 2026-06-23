import type { EnvironmentSnapshot } from '@shared/types'
import type { EnvironmentService } from '../environment/environmentService'

/**
 * A reason for the pet to speak up on its own. `note` is a short Chinese
 * description of the situation that gets handed to the LLM (which phrases it in
 * 小漿糖's voice) — never a canned line, so it stays natural and varied.
 */
export interface ProactiveHint {
  trigger: 'idle' | 'overwork' | 'lateNight' | 'appOpen' | 'clipError' | 'taskDue' | 'poke'
  note: string
}

// Restraint knobs (ms). The whole point is to NOT be annoying.
const MIN_GLOBAL_GAP = 8 * 60_000 // never speak proactively more than once / 8 min
const COOLDOWN: Record<ProactiveHint['trigger'], number> = {
  idle: 10 * 60_000, // "你停好久了" — at most every 10 min
  overwork: 45 * 60_000, // "休息一下" — at most every 45 min
  appOpen: 20 * 60_000, // greet a freshly-focused app — at most every 20 min
  lateNight: 90 * 60_000, // plus a hard daily cap below
  clipError: 5 * 60_000, // offer to help with a copied error — at most every 5 min
  taskDue: 0, // due reminders are fired directly by the controller, not via pick()
  poke: 0 // poke replies are rate-limited in the controller, not via pick()
}
const IDLE_TRIGGER_SECONDS = 300 // 5 min of no input = "卡住了嗎?"
const BREAK_RESETS_AFTER = 180 // 3 min idle counts as a real break (resets work streak)
const OVERWORK_SECONDS = 50 * 60 // 50 min continuous work
const LATE_NIGHT_MAX_PER_DAY = 2
const FOCUS_QUIET = 70 // status.focus at/above this -> hush the chatty triggers
// While the user is deep in focus, only health-related care may speak; the
// chit-chat triggers stay silent so she's a quiet companion, not a distraction.
const CARE_TRIGGERS = new Set<ProactiveHint['trigger']>(['lateNight', 'overwork', 'taskDue'])

/** process.exe (lowercased) -> friendly name, for the "app opened" greeting. */
const WATCHED_APPS: Record<string, string> = {
  'discord.exe': 'Discord',
  'code.exe': 'VS Code',
  'windowsterminal.exe': '終端機',
  'powershell.exe': '終端機',
  'cmd.exe': '終端機',
  'claude.exe': 'Claude Code'
}

/**
 * Watches the environment stream and decides when 小漿糖 should speak up on her
 * own — with hard cooldowns so she stays a companion, not a nag. It only emits a
 * *hint*; the controller turns it into an LLM reply. No clipboard, no keystrokes.
 */
export class ProactiveService {
  private readonly handler = (snap: EnvironmentSnapshot): void => this.evaluate(snap)

  private lastGlobal = 0
  private readonly lastByTrigger: Partial<Record<ProactiveHint['trigger'], number>> = {}
  private workStart: number | null = null
  private lastProcess: string | null = null
  private lateNightDay = ''
  private lateNightCount = 0

  constructor(
    private readonly env: EnvironmentService,
    private readonly onFire: (hint: ProactiveHint) => void,
    /** Live read of config.behaviour.proactive so the toggle takes effect at once. */
    private readonly isEnabled: () => boolean,
    /** Current focus level 0–100 (0 when the status system is off → no extra hush). */
    private readonly getFocus: () => number = () => 0
  ) {}

  start(): void {
    this.env.on('update', this.handler)
  }

  stop(): void {
    this.env.off('update', this.handler)
  }

  /**
   * Called by the clipboard watcher when an error-looking blob was copied. This
   * is a direct reaction to a user action, so it bypasses the global gap but
   * keeps its own cooldown. The content is NOT passed in — she only offers help.
   */
  notifyClipboardError(): void {
    const now = Date.now()
    if (!this.isEnabled() || !this.cooled('clipError', now)) return
    this.lastByTrigger.clipError = now
    this.lastGlobal = now // count it as "she just spoke" so env-rules don't pile on
    this.onFire({
      trigger: 'clipError',
      note: '使用者剛複製了一段看起來像「錯誤訊息」的內容（你還沒看到實際內容）。請主動、簡短、輕鬆地問他要不要讓你幫忙看看，可以順帶提示他按「分析剪貼簿」的快捷鍵。'
    })
  }

  private evaluate(snap: EnvironmentSnapshot): void {
    const now = Date.now()

    // Track the continuous-work streak regardless of whether we're enabled.
    if (snap.idleSeconds >= BREAK_RESETS_AFTER) this.workStart = null
    else if (snap.isActive && this.workStart === null) this.workStart = now

    const prevProcess = this.lastProcess
    this.lastProcess = snap.activeProcess

    if (!this.isEnabled()) return
    if (now - this.lastGlobal < MIN_GLOBAL_GAP) return

    const hint = this.pick(snap, now, prevProcess)
    if (!hint) return
    // Deep focus -> stay quiet unless it's genuine care (break/late-night reminders).
    if (this.getFocus() >= FOCUS_QUIET && !CARE_TRIGGERS.has(hint.trigger)) return

    this.lastGlobal = now
    this.lastByTrigger[hint.trigger] = now
    this.onFire(hint)
  }

  private cooled(trigger: ProactiveHint['trigger'], now: number): boolean {
    return now - (this.lastByTrigger[trigger] ?? 0) >= COOLDOWN[trigger]
  }

  /** First matching rule wins (ordered by importance). Returns null = stay quiet. */
  private pick(snap: EnvironmentSnapshot, now: number, prevProcess: string | null): ProactiveHint | null {
    const hour = new Date().getHours()

    // 1. Late night, still working — gentle, hard-capped per day.
    if (hour >= 0 && hour < 5 && snap.isActive) {
      const day = new Date().toDateString()
      if (this.lateNightDay !== day) {
        this.lateNightDay = day
        this.lateNightCount = 0
      }
      if (this.lateNightCount < LATE_NIGHT_MAX_PER_DAY && this.cooled('lateNight', now)) {
        this.lateNightCount++
        return { trigger: 'lateNight', note: `現在是深夜 ${hour} 點多，使用者還在用電腦。` }
      }
    }

    // 2. Long continuous work — suggest a break.
    if (this.workStart && snap.isActive && now - this.workStart >= OVERWORK_SECONDS * 1000 && this.cooled('overwork', now)) {
      const mins = Math.round((now - this.workStart) / 60_000)
      return { trigger: 'overwork', note: `使用者已經連續工作約 ${mins} 分鐘沒休息了。${this.procNote(snap)}` }
    }

    // 3. Idle for a while — check if they're stuck / away.
    if (snap.idleSeconds >= IDLE_TRIGGER_SECONDS && this.cooled('idle', now)) {
      const mins = Math.round(snap.idleSeconds / 60)
      return { trigger: 'idle', note: `使用者已經閒置約 ${mins} 分鐘沒動作了。${this.procNote(snap)}` }
    }

    // 4. A watched app just came to the foreground.
    const friendly = WATCHED_APPS[(snap.activeProcess ?? '').toLowerCase()]
    if (friendly && snap.activeProcess !== prevProcess && this.cooled('appOpen', now)) {
      return { trigger: 'appOpen', note: `使用者剛切到 ${friendly}。` }
    }

    return null
  }

  private procNote(snap: EnvironmentSnapshot): string {
    const friendly = WATCHED_APPS[(snap.activeProcess ?? '').toLowerCase()]
    return friendly ? `目前在用 ${friendly}。` : ''
  }
}
