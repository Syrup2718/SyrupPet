import type { AppConfig, Emotion, PetReply, CursorPoint } from '@shared/types'

const characterEl = document.getElementById('character') as HTMLDivElement
const bubbleEl = document.getElementById('bubble') as HTMLDivElement

const EMOTIONS: Emotion[] = ['normal', 'happy', 'confused', 'angry', 'thinking', 'sleepy']
const MAX_PUPIL_OFFSET = 4 // px the pupils can drift toward the cursor

/** Random idle lines for the click reaction (no LLM call needed). */
const CLICK_LINES = ['嗨嗨~', '在的在的!', '欸嘿~', '需要我嗎?', '戳我幹嘛啦 >//<', '今天也要加油喔!']

let config: AppConfig | null = null
const svgCache = new Map<Emotion, string>()
let currentEmotion: Emotion = 'normal'
let busyUntil = 0 // while now < busyUntil, proximity won't override the expression
let bubbleTimer: number | undefined

// ----------------------------------------------------------------- bootstrap
async function init(): Promise<void> {
  config = await window.syrup.config.get()
  await preloadEmotions()
  setEmotion('normal')
  wireInteraction()
  wireIpc()
}

async function preloadEmotions(): Promise<void> {
  const pack = config?.character ?? 'default'
  await Promise.all(
    EMOTIONS.map(async (emotion) => {
      try {
        const res = await fetch(`/characters/${pack}/${emotion}.svg`)
        svgCache.set(emotion, await res.text())
      } catch {
        /* missing asset -> emotion simply won't render; non-fatal */
      }
    })
  )
}

// -------------------------------------------------------------- expressions
function setEmotion(emotion: Emotion): void {
  const svg = svgCache.get(emotion)
  if (!svg) return
  characterEl.innerHTML = svg
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

// ---------------------------------------------------------- eye / proximity
function updateGaze(cursor: CursorPoint): void {
  if (!config) return
  const rect = characterEl.getBoundingClientRect()
  const centerX = window.screenX + rect.left + rect.width / 2
  const centerY = window.screenY + rect.top + rect.height / 2
  const dx = cursor.x - centerX
  const dy = cursor.y - centerY
  const dist = Math.hypot(dx, dy)

  // pupils drift toward the cursor (only matters for open-eye expressions)
  const len = dist || 1
  const ox = (dx / len) * MAX_PUPIL_OFFSET
  const oy = (dy / len) * MAX_PUPIL_OFFSET
  characterEl.querySelectorAll<SVGElement>('.pupil').forEach((p) => {
    p.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`
  })

  // proximity -> curious expression, when not busy showing a reply
  if (Date.now() < busyUntil) return
  const near = dist < config.behaviour.proximityRadius
  const desired: Emotion = near ? 'confused' : 'normal'
  if (desired !== currentEmotion) setEmotion(desired)
}

// ------------------------------------------------------------- interaction
function wireInteraction(): void {
  // Toggle window click-through based on whether the cursor is over the body.
  // The window starts click-through with forwarded mouse moves, so this fires
  // even before we "own" the cursor.
  document.addEventListener('mousemove', (e) => {
    const overChar = isOverCharacter(e.clientX, e.clientY)
    window.syrup.pet.setInteractive(overChar)
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
  // a slightly inset box is good enough; transparent corners stay click-through
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
