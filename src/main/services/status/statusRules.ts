import { STATUS_KEYS } from '@shared/types'
import type { EnvironmentSnapshot, PetStatus, StatusEvent, StatusKey } from '@shared/types'

/**
 * Pure rules for the status system. No state, no I/O — just "given a status and
 * a thing that happened, what are the new numbers". Keeping this side-effect-free
 * makes the whole system easy to reason about and tune.
 *
 * Design intent (important): this is NOT a punishment/survival game. Values drift
 * gently back toward a comfortable baseline, interactions feel rewarding, and
 * nothing ever drops fast enough to make her sad just because you stepped away.
 */

/** Where each value settles when nothing is happening. */
const BASELINE: Record<StatusKey, number> = {
  mood: 55, // calm-content, not euphoric
  energy: 70, // overridden by time-of-day below
  affection: 18, // a low floor she drifts to if utterly ignored (never 0)
  focus: 0, // focus only exists while the user is actually focused
  concern: 0 // worry fades once things look fine
}

/** Fraction of the gap to the baseline closed per decay tick (~1 min). Small = gentle. */
const DECAY: Record<StatusKey, number> = {
  mood: 0.03,
  energy: 0.04,
  affection: 0.004, // extremely slow — being ignored barely stings
  focus: 0.06, // focus fades fairly quickly once they stop working
  concern: 0.035
}

/** Discrete interaction effects, applied in full each time they occur. */
const EVENT_DELTAS: Record<StatusEvent, Partial<Record<StatusKey, number>>> = {
  poke: { mood: +2, affection: +1 },
  pokeStorm: { mood: -5, energy: -2 },
  chat: { mood: +3, affection: +2, energy: -1 },
  praised: { mood: +8, affection: +4 },
  thanked: { mood: +4, affection: +3 },
  taskComplete: { mood: +5, affection: +2, concern: -3 },
  clipboardError: { concern: +3, affection: +1 }
}

const FOCUS_APPS = new Set(['code.exe', 'windowsterminal.exe', 'powershell.exe', 'cmd.exe', 'claude.exe', 'devenv.exe'])
const IDLE_SECONDS = 300 // 5 min of no input counts as "away/drowsy"
const OVERWORK_MS = 50 * 60_000 // 50 min continuous = starting to worry

export function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/** A fresh status for a brand-new user (she's only just met you). */
export function initialStatus(now: number): PetStatus {
  return { mood: 70, energy: 80, affection: 20, focus: 0, concern: 0, updatedAt: now }
}

/** Coerce arbitrary parsed JSON into a valid status (clamped, all keys present). */
export function sanitize(raw: unknown, now: number): PetStatus {
  const base = initialStatus(now)
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  for (const key of STATUS_KEYS) {
    if (typeof o[key] === 'number' && Number.isFinite(o[key])) base[key] = clamp(o[key] as number)
  }
  if (typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt)) base.updatedAt = o.updatedAt
  return base
}

/** Apply a named interaction. Returns a new status (does not mutate the input). */
export function applyEvent(status: PetStatus, event: StatusEvent, now: number): PetStatus {
  const next = { ...status }
  const deltas = EVENT_DELTAS[event]
  for (const key of STATUS_KEYS) {
    const d = deltas[key]
    if (d) next[key] = clamp(next[key] + d)
  }
  next.updatedAt = now
  return next
}

/** Energy wants to be lower late at night / early morning, higher in the day. */
function energyBaseline(hour: number): number {
  if (hour >= 0 && hour < 6) return 38 // deep night — she's sleepy too
  if (hour >= 23) return 52
  if (hour >= 6 && hour < 9) return 62 // early morning, waking up
  return 72
}

/**
 * One ambient step (~1 min): pull every value gently toward its baseline, then
 * layer on small nudges driven by what the user is doing right now. The two
 * together give smooth, believable drift instead of jumpy numbers.
 */
export function ambientStep(
  status: PetStatus,
  snap: EnvironmentSnapshot | null,
  workStreakMs: number,
  hour: number,
  now: number
): PetStatus {
  const next = { ...status }
  const baseline: Record<StatusKey, number> = { ...BASELINE, energy: energyBaseline(hour) }

  for (const key of STATUS_KEYS) {
    next[key] = next[key] + (baseline[key] - next[key]) * DECAY[key]
  }

  if (snap) {
    const proc = (snap.activeProcess ?? '').toLowerCase()
    const lateNight = hour >= 0 && hour < 5

    if (snap.isActive && FOCUS_APPS.has(proc)) {
      next.focus += 6 // actively coding/terminal -> focus builds
    }
    if (snap.isActive && lateNight) {
      next.concern += 2.2 // up late -> she worries a little
      next.energy -= 1
    }
    if (snap.isActive && workStreakMs >= OVERWORK_MS) {
      next.concern += 1.6 // long unbroken streak -> "take a break?"
      next.energy -= 1
    }
    if (snap.idleSeconds >= IDLE_SECONDS) {
      next.energy -= 1.6 // long idle -> drowsy / winding down
      next.focus -= 4 // not at the keyboard -> not focused
    }
  }

  for (const key of STATUS_KEYS) next[key] = clamp(next[key])
  next.updatedAt = now
  return next
}

/** True when this process is one the user "focuses" in (coding / terminal). */
export function isFocusApp(process: string | null): boolean {
  return FOCUS_APPS.has((process ?? '').toLowerCase())
}

// --------------------------------------------------------- LLM prompt framing
function band(v: number, low: string, mid: string, high: string): string {
  return v < 34 ? low : v < 67 ? mid : high
}

/** A short, qualitative read of each value for the LLM (never raw "report numbers"). */
export function describeStatus(s: PetStatus): string {
  const mood = band(s.mood, '心情低落', '心情普通', '心情很好')
  const energy = band(s.energy, '很累/想睡', '精神普通', '活力充沛')
  const affection = band(s.affection, '還在熟悉彼此', '已經蠻熟了', '非常親近')
  const focus = band(s.focus, '使用者沒在專注', '使用者半專注', '使用者正在高度專注')
  const concern = band(s.concern, '不太擔心', '有點擔心他', '很擔心/心疼他')
  return [
    '（你現在的內在狀態,請讓語氣與表情自然反映,但「不要」把數字或這些標籤講出來）：',
    `- 心情：${mood}`,
    `- 能量：${energy}`,
    `- 與使用者的親密度：${affection}`,
    `- 使用者的專注程度：${focus}`,
    `- 你對使用者的擔心：${concern}`
  ].join('\n')
}
