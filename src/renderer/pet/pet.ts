import { EMOTIONS } from '@shared/types'
import type { AppConfig, Emotion, PetReply, CursorPoint } from '@shared/types'

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

/** Random idle lines for the click reaction (no LLM call needed). */
const CLICK_LINES = ['嗨嗨~', '在的在的!', '欸嘿~', '需要我嗎?', '戳我幹嘛啦 >//<', '今天也要加油喔!']

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
  const pack = config.character || 'default'
  renderer = await buildRenderer(pack)
  setEmotion('normal')
  wireInteraction()
  wireIpc()
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

  // grabX/grabY = cursor offset within the window at grab time (client px).
  // The frameless window's content origin is its top-left, so keeping this
  // offset under the cursor = window top-left is (screenX - grabX, screenY - grabY).
  let grabX = 0
  let grabY = 0
  let startScreenX = 0
  let startScreenY = 0
  let dragging = false

  characterEl.addEventListener('mousedown', (e) => {
    grabX = e.clientX
    grabY = e.clientY
    startScreenX = e.screenX
    startScreenY = e.screenY
    dragging = false
    // Lock interactive for the whole drag so we always get the mouseup.
    window.syrup.pet.setInteractive(true)
    window.syrup.pet.dragStart()
    characterEl.classList.add('dragging')
  })

  window.addEventListener('mousemove', (e) => {
    if (!characterEl.classList.contains('dragging')) return
    // Use screen coords for the drag threshold: while the window follows the
    // cursor, clientX stays ~constant, so it can't be used to detect movement.
    if (Math.hypot(e.screenX - startScreenX, e.screenY - startScreenY) > 5) dragging = true
    window.syrup.pet.dragMove(e.screenX - grabX, e.screenY - grabY)
  })

  window.addEventListener('mouseup', (e) => {
    if (!characterEl.classList.contains('dragging')) return
    characterEl.classList.remove('dragging')
    window.syrup.pet.dragEnd()
    // Re-evaluate click-through now that the drag is over.
    window.syrup.pet.setInteractive(isOverCharacter(e.clientX, e.clientY))
    const moved = Math.hypot(e.screenX - startScreenX, e.screenY - startScreenY)
    if (moved < 5 && !dragging) onClick()
  })
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
  const line = CLICK_LINES[Math.floor(Math.random() * CLICK_LINES.length)]
  setEmotion('happy')
  playAction('jump')
  showBubble(line, 2500)
  busyUntil = Date.now() + 2600
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
}

void init()
