import { EMOTIONS } from '@shared/types'
import type { AppConfig, Emotion, PetReply, CursorPoint } from '@shared/types'
import { configureSfx, playClick, playEmotion } from './sfx'

const characterEl = document.getElementById('character') as HTMLDivElement
const bubbleEl = document.getElementById('bubble') as HTMLDivElement

const MAX_PUPIL_OFFSET = 4 // px the pupils can drift toward the cursor
const MAX_TILT_DEG = 7 // single-image: how far the body leans toward the cursor

const EMOTION_EMOJI: Record<Emotion, string> = {
  normal: '',
  happy: '😄',
  confused: '❓',
  angry: '😤',
  thinking: '🤔',
  sleepy: '😴',
  shy: '😳',
  excited: '✨',
  love: '💕',
  sad: '🥺'
}

/** A local poke reaction: a line, the expression, and whether it's a "mad" wobble. */
interface PokeReaction {
  line: string
  emotion: Emotion
  mad?: boolean
}

// Escalation tiers — poke faster/more and she gets annoyed, then angry.
const POKE_HAPPY: PokeReaction[] = [
  { line: '嗨嗨~', emotion: 'happy' },
  { line: '在的在的!', emotion: 'happy' },
  { line: '欸嘿~ 戳到我了', emotion: 'happy' },
  { line: '需要我嗎?', emotion: 'happy' },
  { line: '今天也要加油喔!', emotion: 'happy' },
  { line: '呼呀~ 癢癢的', emotion: 'happy' }
]
const POKE_ANNOYED: PokeReaction[] = [
  { line: '欸…幹嘛啦~', emotion: 'confused' },
  { line: '又戳?', emotion: 'confused' },
  { line: '你很閒喔 >_<', emotion: 'confused' },
  { line: '別鬧啦~', emotion: 'confused' }
]
const POKE_ANNOYED2: PokeReaction[] = [
  { line: '真的很煩欸 >_<', emotion: 'confused', mad: true },
  { line: '不要再戳了啦!', emotion: 'angry', mad: true },
  { line: '我快生氣囉…', emotion: 'angry', mad: true }
]
const POKE_ANGRY: PokeReaction[] = [
  { line: '不要一直戳我啦 >//<', emotion: 'angry', mad: true },
  { line: '哼!我生氣了!', emotion: 'angry', mad: true },
  { line: '再戳我就不理你了!', emotion: 'angry', mad: true },
  { line: '(鼓起臉頰)…', emotion: 'angry', mad: true }
]
// State-aware reactions for a calm, single poke (override the happy default).
const POKE_SLEEPY: PokeReaction[] = [
  { line: '唔…想睡了啦~', emotion: 'sleepy' },
  { line: '好睏…別戳我惹', emotion: 'sleepy' },
  { line: '再讓我瞇一下下…', emotion: 'sleepy' }
]
const POKE_COMFORT: PokeReaction[] = [
  { line: '謝謝你…我好一點了', emotion: 'happy' },
  { line: '摸摸~ 有你在感覺好多了', emotion: 'love' },
  { line: '嗯…陪我一下下', emotion: 'happy' }
]
const POKE_THINKING: PokeReaction[] = [
  { line: '等一下啦,我在想…', emotion: 'thinking' },
  { line: '噓~ 思考中', emotion: 'thinking' },
  { line: '想到一半被你打斷了啦', emotion: 'confused' }
]

const POKE_CHAIN_MS = 1600 // pokes within this gap escalate; a pause resets to friendly
const POKE_RAGE_QUIT = 10 // poke this many in a row and she hides in a huff
const LLM_POKE_COOLDOWN = 3 * 60_000 // occasional improvised line, rate-limited
let pokeCount = 0
let lastPokeAt = 0
let lastLlmPokeAt = 0
let moodEmotion: Emotion = 'normal' // her last genuinely-expressed mood
let moodUntil = 0

// Being picked up & carried: she switches to a flustered "lifted" pose.
const LIFT_EMOTION: Emotion = 'shy'
const DRAG_LINES = [
  '哇啊~ 被抓起來了!',
  '欸欸欸 要去哪裡啦~',
  '咻——! 飛高高~',
  '輕、輕一點啦 >//<',
  '帶我去哪裡呀?'
]
let preDragEmotion: Emotion = 'normal' // restore this face when she's set down

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * A character pack's manifest. Optional file `manifest.json` inside the pack
 * folder selects how the pack is rendered. With no manifest we assume the
 * legacy per-emotion SVG layout (backward compatible with the bundled default).
 */
interface CharacterManifest {
  name?: string
  mode: 'svg' | 'single' | 'multi'
  image?: string // single mode only; defaults to "character.png"
  images?: Partial<Record<Emotion, string>> // multi mode: per-emotion file names
}

/** A render strategy: how a given pack draws emotions and reacts to the cursor. */
interface CharacterRenderer {
  setEmotion(emotion: Emotion): void
  /** dx/dy/dist are character-center -> cursor, in screen pixels. */
  updateGaze(dx: number, dy: number, dist: number): void
}

let config: AppConfig | null = null
let renderer: CharacterRenderer
let currentEmotion: Emotion = 'normal'
let busyUntil = 0 // while now < busyUntil, proximity won't override the expression
let bubbleTimer: number | undefined

// ----------------------------------------------------------------- bootstrap
async function init(): Promise<void> {
  config = await window.syrup.config.get()
  applySfxConfig(config)
  const pack = config.character || 'default'
  renderer = await buildRenderer(pack)
  setEmotion('normal')
  wireInteraction()
  wireIpc()
}

function applySfxConfig(c: AppConfig): void {
  configureSfx({ enabled: c.behaviour.sound, volume: c.behaviour.soundVolume / 100 })
}

async function buildRenderer(pack: string): Promise<CharacterRenderer> {
  const manifest = await loadManifest(pack)
  if (manifest.mode === 'multi') {
    const multi = await MultiImageRenderer.create(pack, manifest.images || {})
    if (multi) return multi
    console.warn(`[pet] multi-image pack "${pack}" failed to load; falling back to default SVG`)
    return await SvgRenderer.create('default')
  }
  if (manifest.mode === 'single') {
    const single = await SingleImageRenderer.create(pack, manifest.image || 'character.png')
    if (single) return single
    // image missing/broken -> fall back to the bundled SVG default so dev still runs
    console.warn(`[pet] single-image pack "${pack}" failed to load; falling back to default SVG`)
    return await SvgRenderer.create('default')
  }
  return await SvgRenderer.create(pack)
}

async function loadManifest(pack: string): Promise<CharacterManifest> {
  try {
    const res = await fetch(`/characters/${pack}/manifest.json`)
    if (res.ok) return (await res.json()) as CharacterManifest
  } catch {
    /* no manifest -> legacy svg pack */
  }
  return { mode: 'svg' }
}

// ---------------------------------------------------- SVG (multi-expression)
class SvgRenderer implements CharacterRenderer {
  private cache = new Map<Emotion, string>()

  static async create(pack: string): Promise<SvgRenderer> {
    const r = new SvgRenderer()
    await Promise.all(
      EMOTIONS.map(async (emotion) => {
        try {
          const res = await fetch(`/characters/${pack}/${emotion}.svg`)
          if (res.ok) r.cache.set(emotion, await res.text())
        } catch {
          /* missing emotion asset -> simply won't render that one */
        }
      })
    )
    return r
  }

  setEmotion(emotion: Emotion): void {
    const svg = this.cache.get(emotion)
    if (svg) characterEl.innerHTML = svg
  }

  updateGaze(dx: number, dy: number, dist: number): void {
    const len = dist || 1
    const ox = (dx / len) * MAX_PUPIL_OFFSET
    const oy = (dy / len) * MAX_PUPIL_OFFSET
    characterEl.querySelectorAll<SVGElement>('.pupil').forEach((p) => {
      p.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`
    })
  }
}

// ----------------------------------------------------- single static image
class SingleImageRenderer implements CharacterRenderer {
  private img!: HTMLImageElement
  private badge!: HTMLDivElement

  static async create(pack: string, file: string): Promise<SingleImageRenderer | null> {
    const src = `/characters/${pack}/${file}`
    const ok = await canLoad(src)
    if (!ok) return null

    const r = new SingleImageRenderer()
    characterEl.innerHTML = ''
    r.img = document.createElement('img')
    r.img.className = 'char-img'
    r.img.src = src
    r.img.draggable = false
    r.badge = document.createElement('div')
    r.badge.className = 'emotion-badge hidden'
    characterEl.append(r.img, r.badge)
    return r
  }

  setEmotion(emotion: Emotion): void {
    // emotion can't change a static image's face, so we convey it with a badge
    // + a subtle whole-image filter (set via a class on #character).
    const emoji = EMOTION_EMOJI[emotion]
    this.badge.textContent = emoji
    this.badge.classList.toggle('hidden', emoji === '')
    characterEl.classList.remove(...EMOTIONS.map((e) => `emo-${e}`))
    characterEl.classList.add(`emo-${emotion}`)
  }

  updateGaze(dx: number, dy: number, dist: number): void {
    leanToward(this.img, dx, dy, dist)
  }
}

// -------------------------------------------- multi image (one per emotion)
class MultiImageRenderer implements CharacterRenderer {
  private img!: HTMLImageElement
  private sources = new Map<Emotion, string>()
  private currentSrc = ''

  static async create(
    pack: string,
    images: Partial<Record<Emotion, string>>
  ): Promise<MultiImageRenderer | null> {
    const r = new MultiImageRenderer()
    await Promise.all(
      EMOTIONS.map(async (emotion) => {
        const file = images[emotion] || `${emotion}.png`
        const src = `/characters/${pack}/${file}`
        if (await canLoad(src)) r.sources.set(emotion, src) // also warms the browser cache
      })
    )
    // need at least the resting face to be usable
    if (!r.srcFor('normal')) return null

    characterEl.innerHTML = ''
    r.img = document.createElement('img')
    r.img.className = 'char-img'
    r.img.draggable = false
    r.currentSrc = r.srcFor('normal')
    r.img.src = r.currentSrc
    characterEl.append(r.img)
    return r
  }

  /** The image for an emotion, falling back to the resting face when missing. */
  private srcFor(emotion: Emotion): string {
    return this.sources.get(emotion) || this.sources.get('normal') || ''
  }

  setEmotion(emotion: Emotion): void {
    const src = this.srcFor(emotion)
    if (!src || src === this.currentSrc) return
    this.currentSrc = src
    this.img.src = src
  }

  updateGaze(dx: number, dy: number, dist: number): void {
    leanToward(this.img, dx, dy, dist)
  }
}

/** Lean a raster image toward the cursor as a stand-in for "looking at it". */
function leanToward(img: HTMLImageElement, dx: number, dy: number, dist: number): void {
  const len = dist || 1
  const tilt = (dx / len) * MAX_TILT_DEG
  const shiftY = (dy / len) * 3
  img.style.transform = `rotate(${tilt.toFixed(1)}deg) translateY(${shiftY.toFixed(1)}px)`
}

/** Resolve true once an image URL has loaded, false if it errors. */
function canLoad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Image()
    probe.onload = () => resolve(true)
    probe.onerror = () => resolve(false)
    probe.src = src
  })
}

// -------------------------------------------------------------- expressions
function setEmotion(emotion: Emotion): void {
  renderer.setEmotion(emotion)
  currentEmotion = emotion
}

function playAction(action: PetReply['action']): void {
  const cls = `act-${action}`
  characterEl.classList.remove('act-jump', 'act-nod', 'act-shake', 'act-wave', 'act-sleep')
  // force reflow so re-adding the same class restarts the animation
  void characterEl.offsetWidth
  if (action !== 'idle') characterEl.classList.add(cls)
}

function showBubble(text: string, holdMs = 6000): void {
  bubbleEl.textContent = text
  bubbleEl.classList.remove('hidden')
  window.clearTimeout(bubbleTimer)
  bubbleTimer = window.setTimeout(() => bubbleEl.classList.add('hidden'), holdMs)
}

/** Apply a full reply: bubble + expression + action, and mark "busy". */
function applyReply(reply: PetReply): void {
  setEmotion(reply.emotion)
  playAction(reply.action)
  showBubble(reply.text)
  playEmotion(reply.emotion) // a short cue when she speaks (not on idle emotion flips)
  moodEmotion = reply.emotion // remember her mood so a poke can react to it
  moodUntil = Date.now() + 60_000
  busyUntil = Date.now() + 6500
}

// ---------------------------------------------------------- gaze / proximity
function updateGaze(cursor: CursorPoint): void {
  if (!config) return
  const rect = characterEl.getBoundingClientRect()
  const centerX = window.screenX + rect.left + rect.width / 2
  const centerY = window.screenY + rect.top + rect.height / 2
  const dx = cursor.x - centerX
  const dy = cursor.y - centerY
  const dist = Math.hypot(dx, dy)

  renderer.updateGaze(dx, dy, dist)

  // proximity -> curious expression, when not busy showing a reply
  if (Date.now() < busyUntil) return
  const near = dist < config.behaviour.proximityRadius
  const desired: Emotion = near ? 'confused' : 'normal'
  if (desired !== currentEmotion) setEmotion(desired)
}

// ------------------------------------------------------------- interaction
function wireInteraction(): void {
  // Toggle window click-through based on whether the cursor is over the body.
  // IMPORTANT: never toggle while dragging — if the window went click-through
  // mid-drag, the renderer would stop receiving the mouseup that ends the drag,
  // and the pet would follow the cursor forever ("drifting away").
  document.addEventListener('mousemove', (e) => {
    if (characterEl.classList.contains('dragging')) return
    window.syrup.pet.setInteractive(isOverCharacter(e.clientX, e.clientY))
  })

  // Drop the one-shot poke animation when it finishes so breathing resumes.
  characterEl.addEventListener('animationend', (e) => {
    if (e.animationName === 'squish' || e.animationName === 'pokeShake') {
      characterEl.classList.remove('poke', 'poke-mad')
    }
  })

  let downX = 0
  let downY = 0
  let dragging = false

  characterEl.addEventListener('mousedown', (e) => {
    downX = e.clientX
    downY = e.clientY
    dragging = false
    // Lock interactive for the whole drag so we always get the mouseup.
    window.syrup.pet.setInteractive(true)
    window.syrup.pet.dragStart()
    characterEl.classList.add('dragging')
  })

  window.addEventListener('mouseup', (e) => {
    if (!characterEl.classList.contains('dragging')) return
    characterEl.classList.remove('dragging')
    window.syrup.pet.dragEnd()
    if (dragging) exitLiftPose()
    // Re-evaluate click-through now that the drag is over.
    window.syrup.pet.setInteractive(isOverCharacter(e.clientX, e.clientY))
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
    if (moved < 5 && !dragging) onClick()
  })

  window.addEventListener('mousemove', (e) => {
    if (!characterEl.classList.contains('dragging')) return
    // First real movement past the threshold -> she's been lifted off the ground.
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
      dragging = true
      enterLiftPose()
    }
  })
}

/** Picked up: swing into the flustered carry pose and squeal a little. */
function enterLiftPose(): void {
  preDragEmotion = currentEmotion
  setEmotion(LIFT_EMOTION)
  characterEl.classList.add('lifted')
  showBubble(pick(DRAG_LINES), 1800)
  playClick()
  busyUntil = Number.MAX_SAFE_INTEGER // hold the pose; cleared the moment she's set down
}

/** Set down: drop the carry pose and settle back to her previous face. */
function exitLiftPose(): void {
  characterEl.classList.remove('lifted')
  busyUntil = Date.now() + 400 // brief settle so proximity doesn't instantly flip her
  setEmotion(preDragEmotion)
}

function isOverCharacter(clientX: number, clientY: number): boolean {
  const rect = characterEl.getBoundingClientRect()
  const pad = 18
  return (
    clientX >= rect.left + pad &&
    clientX <= rect.right - pad &&
    clientY >= rect.top + pad &&
    clientY <= rect.bottom
  )
}

function onClick(): void {
  const now = Date.now()
  pokeCount = now - lastPokeAt < POKE_CHAIN_MS ? pokeCount + 1 : 1
  lastPokeAt = now

  // Last straw: poked way too many times in a row -> she storms off.
  if (pokeCount >= POKE_RAGE_QUIT) {
    playClick()
    playPokeAnim(true)
    setEmotion('angry')
    showBubble('哼!我不理你了啦! ( ›´ω`‹ )', 1500)
    busyUntil = now + 2000
    pokeCount = 0
    lastPokeAt = 0
    window.setTimeout(() => window.syrup.pet.sulk(), 950) // let the line show first
    return
  }

  const reaction = pickPokeReaction(pokeCount, now)
  playClick()
  playPokeAnim(reaction.mad === true)
  setEmotion(reaction.emotion)
  showBubble(reaction.line, 2400)
  busyUntil = now + 2500

  // Occasionally let the LLM improvise a fresh, context-aware line — only on a
  // calm single poke, and rate-limited, so it stays a surprise (not API spam).
  if (pokeCount <= 2 && now - lastLlmPokeAt > LLM_POKE_COOLDOWN) {
    lastLlmPokeAt = now
    window.syrup.pet.poke()
  }
}

/** First few pokes react to her mood/time; rapid repeats escalate to anger. */
function pickPokeReaction(count: number, now: number): PokeReaction {
  if (count <= 2) {
    const hour = new Date().getHours()
    const mood = now < moodUntil ? moodEmotion : 'normal'
    if (mood === 'sad') return pick(POKE_COMFORT)
    if (mood === 'sleepy' || hour < 6) return pick(POKE_SLEEPY)
    if (mood === 'thinking') return pick(POKE_THINKING)
    return pick(POKE_HAPPY)
  }
  if (count >= 7) return pick(POKE_ANGRY)
  if (count >= 5) return pick(POKE_ANNOYED2)
  return pick(POKE_ANNOYED)
}

function playPokeAnim(mad: boolean): void {
  characterEl.classList.remove('poke', 'poke-mad', 'act-jump', 'act-nod', 'act-shake', 'act-wave', 'act-sleep')
  void characterEl.offsetWidth // restart the animation
  characterEl.classList.add(mad ? 'poke-mad' : 'poke')
}

// --------------------------------------------------------------------- ipc
function wireIpc(): void {
  window.syrup.pet.onSay((reply) => applyReply(reply))
  window.syrup.pet.onEmotion((emotion) => {
    if (EMOTIONS.includes(emotion as Emotion)) {
      setEmotion(emotion as Emotion)
      busyUntil = Date.now() + 4000
    }
  })
  window.syrup.pet.onCursor((p) => updateGaze(p))
  // Live settings: apply sound on/off + volume the moment they're saved.
  window.syrup.config.onChanged((c) => {
    config = c
    applySfxConfig(c)
  })
}

void init()
