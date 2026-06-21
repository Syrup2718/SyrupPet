/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files needed.
 * Each cue is a couple of short, soft oscillator blips with a quick envelope, so
 * the pet feels alive without ever being loud or shipping binary assets.
 */

let ctx: AudioContext | null = null
let enabled = true
let volume = 0.35 // 0–1

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function configureSfx(opts: { enabled?: boolean; volume?: number }): void {
  if (opts.enabled !== undefined) enabled = opts.enabled
  if (opts.volume !== undefined) volume = Math.max(0, Math.min(1, opts.volume))
}

interface Note {
  freq: number
  /** seconds from "now" */
  start: number
  dur: number
  type?: OscillatorType
  /** 0–1 relative loudness within the cue */
  gain?: number
}

function play(notes: Note[]): void {
  if (!enabled || volume <= 0 || !notes.length) return
  const c = audio()
  if (c.state === 'suspended') void c.resume()
  const now = c.currentTime
  for (const n of notes) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq
    const peak = Math.max(0.0002, volume * (n.gain ?? 1) * 0.5)
    const t0 = now + n.start
    const t1 = t0 + n.dur
    g.gain.setValueAtTime(0.0002, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0002, t1)
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  }
}

/** Soft "boop" when you poke her. */
export function playClick(): void {
  play([
    { freq: 520, start: 0, dur: 0.08 },
    { freq: 780, start: 0.045, dur: 0.08, gain: 0.8 }
  ])
}

/** A short cue matching the emotion she just expressed (played when she speaks). */
const EMOTION_SFX: Record<string, Note[]> = {
  happy: [
    { freq: 660, start: 0, dur: 0.1 },
    { freq: 880, start: 0.08, dur: 0.12 }
  ],
  excited: [
    { freq: 660, start: 0, dur: 0.07 },
    { freq: 880, start: 0.06, dur: 0.07 },
    { freq: 1100, start: 0.12, dur: 0.12 }
  ],
  love: [
    { freq: 740, start: 0, dur: 0.12 },
    { freq: 988, start: 0.1, dur: 0.14 }
  ],
  confused: [
    { freq: 500, start: 0, dur: 0.1 },
    { freq: 430, start: 0.1, dur: 0.12 }
  ],
  angry: [{ freq: 200, start: 0, dur: 0.13, type: 'square', gain: 0.5 }],
  sad: [
    { freq: 470, start: 0, dur: 0.14 },
    { freq: 350, start: 0.12, dur: 0.18 }
  ],
  sleepy: [{ freq: 330, start: 0, dur: 0.24 }],
  thinking: [{ freq: 600, start: 0, dur: 0.08, gain: 0.6 }],
  normal: [{ freq: 620, start: 0, dur: 0.09, gain: 0.7 }]
}

export function playEmotion(emotion: string): void {
  play(EMOTION_SFX[emotion] ?? EMOTION_SFX.normal)
}
