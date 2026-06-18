import type { AppConfig, Emotion, PetReply, CursorPoint } from '@shared/types'

const characterEl = document.getElementById('character') as HTMLDivElement
const bubbleEl = document.getElementById('bubble') as HTMLDivElement

const EMOTIONS: Emotion[] = ['normal', 'happy', 'confused', 'angry', 'thinking', 'sleepy']
const MAX_PUPIL_OFFSET = 4 // px the pupils can drift toward the cursor
const MAX_TILT_DEG = 7 // single-image: how far the body leans toward the cursor

const EMOTION_EMOJI: Record<Emotion, string> = {
  normal: '',
  happy: '😄',
  confused: '❓',
  angry: '😤',
  thinking: '🤔',
  sleepy: '😴'
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
  mode: 'svg' | 'single'
  image?: string // single mode only; defaults to "character.png"
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
    // lean the whole body toward the cursor as a stand-in for "looking at it"
    const len = dist || 1
    const tilt = (dx / len) * MAX_TILT_DEG
    const shiftY = (dy / len) * 3
    this.img.style.transform = `rotate(${tilt.toFixed(1)}deg) translateY(${shiftY.toFixed(1)}px)`
  }
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
  document.addEventListener('mousemove', (e) => {
    window.syrup.pet.setInteractive(isOverCharacter(e.clientX, e.clientY))
  })

  let downX = 0
  let downY = 0
  let dragging = false

  characterEl.addEventListener('mousedown', (e) => {
    downX = e.clientX
    downY = e.clientY
    dragging = false
    window.syrup.pet.dragStart()
    characterEl.classList.add('dragging')
  })

  window.addEventListener('mouseup', (e) => {
    if (!characterEl.classList.contains('dragging')) return
    characterEl.classList.remove('dragging')
    window.syrup.pet.dragEnd()
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
    if (moved < 5 && !dragging) onClick()
  })

  window.addEventListener('mousemove', (e) => {
    if (characterEl.classList.contains('dragging')) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) dragging = true
    }
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
