import type { Emotion, PetReply } from '@shared/types'

const messagesEl = document.getElementById('messages') as HTMLDivElement
const inputEl = document.getElementById('input') as HTMLTextAreaElement
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement
const clipboardBtn = document.getElementById('clipboard-btn') as HTMLButtonElement
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement
const typingEl = document.getElementById('typing') as HTMLDivElement

const EMOTION_EMOJI: Record<Emotion, string> = {
  normal: '🙂',
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

function addMessage(role: 'user' | 'assistant' | 'system', text: string, emotion?: Emotion): void {
  const el = document.createElement('div')
  el.className = `msg ${role}`
  if (role === 'assistant' && emotion) {
    const emo = document.createElement('span')
    emo.className = 'emo'
    emo.textContent = EMOTION_EMOJI[emotion]
    el.appendChild(emo)
    el.appendChild(document.createTextNode(text))
  } else {
    el.textContent = text
  }
  messagesEl.appendChild(el)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

async function send(): Promise<void> {
  const text = inputEl.value.trim()
  if (!text) return
  addMessage('user', text)
  inputEl.value = ''
  autoGrow()
  // Assistant reply arrives via the onReply event (shared with clipboard path),
  // so we don't append the resolved value here to avoid duplicates.
  await window.syrup.chat.send(text)
}

function autoGrow(): void {
  inputEl.style.height = 'auto'
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 110)}px`
}

// ---- events ----
sendBtn.addEventListener('click', () => void send())
inputEl.addEventListener('input', autoGrow)
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
})
clipboardBtn.addEventListener('click', () => void window.syrup.chat.analyzeClipboard())
closeBtn.addEventListener('click', () => window.syrup.window.close())

window.syrup.chat.onThinking((thinking) => {
  typingEl.classList.toggle('hidden', !thinking)
  sendBtn.disabled = thinking
  if (thinking) messagesEl.scrollTop = messagesEl.scrollHeight
})

window.syrup.chat.onReply(({ request, reply }: { request: { intent: string }; reply: PetReply }) => {
  if (request.intent === 'clipboard') addMessage('system', '📋 分析剪貼簿內容…')
  addMessage('assistant', reply.text, reply.emotion)
})

addMessage('system', '嗨~我是小漿糖!按 📋 可以幫你看剪貼簿,或直接打字跟我聊天 🍮')
inputEl.focus()
