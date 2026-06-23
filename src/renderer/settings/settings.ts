import type { AppConfig, LLMProviderId, PetStatus, StatusKey } from '@shared/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

/** Display order, label and bar colour for each status value. */
const STATUS_META: { key: StatusKey; label: string; color: string }[] = [
  { key: 'mood', label: '心情', color: '#f0a64b' },
  { key: 'energy', label: '能量', color: '#5ec27a' },
  { key: 'affection', label: '親密度', color: '#ec6f9e' },
  { key: 'focus', label: '專注度', color: '#5a9bd8' },
  { key: 'concern', label: '擔心值', color: '#b07fd0' }
]

const els = {
  provider: $<HTMLSelectElement>('provider'),
  baseUrl: $<HTMLInputElement>('baseUrl'),
  apiKey: $<HTMLInputElement>('apiKey'),
  model: $<HTMLInputElement>('model'),
  character: $<HTMLSelectElement>('character'),
  persona: $<HTMLTextAreaElement>('persona'),
  followCursor: $<HTMLInputElement>('followCursor'),
  useEnvironmentContext: $<HTMLInputElement>('useEnvironmentContext'),
  proactive: $<HTMLInputElement>('proactive'),
  watchClipboard: $<HTMLInputElement>('watchClipboard'),
  launchOnStartup: $<HTMLInputElement>('launchOnStartup'),
  proximityRadius: $<HTMLInputElement>('proximityRadius'),
  proximityVal: $<HTMLSpanElement>('proximityVal'),
  sound: $<HTMLInputElement>('sound'),
  soundVolume: $<HTMLInputElement>('soundVolume'),
  soundVolumeVal: $<HTMLSpanElement>('soundVolumeVal'),
  memory: $<HTMLInputElement>('memory'),
  memoryList: $<HTMLUListElement>('memory-list'),
  memoryClear: $<HTMLButtonElement>('memory-clear'),
  statusEnabled: $<HTMLInputElement>('statusEnabled'),
  statusBars: $<HTMLDivElement>('status-bars'),
  statusReset: $<HTMLButtonElement>('status-reset'),
  hkChat: $<HTMLInputElement>('hk-chat'),
  hkClip: $<HTMLInputElement>('hk-clip'),
  hkPet: $<HTMLInputElement>('hk-pet'),
  save: $<HTMLButtonElement>('save-btn'),
  close: $<HTMLButtonElement>('close-btn'),
  status: $<HTMLSpanElement>('status')
}

let config: AppConfig

/** Show the provider-specific fields for the currently selected provider. */
function loadProviderFields(id: LLMProviderId): void {
  const p = config.providers[id]
  els.baseUrl.value = p.baseUrl
  els.apiKey.value = p.apiKey
  els.model.value = p.model
}

/** Persist the on-screen provider fields back into config in memory. */
function captureProviderFields(id: LLMProviderId): void {
  config.providers[id] = {
    id,
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim()
  }
}

/** Show what 小漿糖 currently remembers (read-only, for transparency). */
async function renderMemories(): Promise<void> {
  const memories = await window.syrup.memory.list()
  els.memoryList.innerHTML = ''
  if (!memories.length) {
    const li = document.createElement('li')
    li.className = 'muted'
    li.textContent = '（還沒記得任何事）'
    els.memoryList.appendChild(li)
    return
  }
  for (const m of memories) {
    const li = document.createElement('li')
    li.textContent = m.text
    els.memoryList.appendChild(li)
  }
}

/** Draw the five status bars (read-only). Dims them when the system is off. */
function renderStatus(status: PetStatus): void {
  els.statusBars.classList.toggle('disabled', !els.statusEnabled.checked)
  els.statusBars.innerHTML = ''
  for (const { key, label, color } of STATUS_META) {
    const value = Math.round(status[key])
    const row = document.createElement('div')
    row.className = 'status-bar'

    const name = document.createElement('span')
    name.className = 'sb-label'
    name.textContent = label

    const track = document.createElement('div')
    track.className = 'sb-track'
    const fill = document.createElement('div')
    fill.className = 'sb-fill'
    fill.style.width = `${value}%`
    fill.style.background = color
    track.appendChild(fill)

    const val = document.createElement('span')
    val.className = 'sb-val'
    val.textContent = String(value)

    row.append(name, track, val)
    els.statusBars.appendChild(row)
  }
}

async function init(): Promise<void> {
  config = await window.syrup.config.get()

  els.provider.value = config.provider
  loadProviderFields(config.provider)
  els.character.value = config.character
  // If the saved pack is no longer offered in the dropdown (e.g. chibi/default),
  // the value won't match any <option> and goes blank — fall back to custom.
  if (!els.character.value) els.character.value = 'custom'
  els.persona.value = config.persona
  els.followCursor.checked = config.behaviour.followCursor
  els.useEnvironmentContext.checked = config.behaviour.useEnvironmentContext
  els.proactive.checked = config.behaviour.proactive
  els.watchClipboard.checked = config.behaviour.watchClipboard
  els.launchOnStartup.checked = config.launchOnStartup
  els.proximityRadius.value = String(config.behaviour.proximityRadius)
  els.proximityVal.textContent = String(config.behaviour.proximityRadius)
  els.sound.checked = config.behaviour.sound
  els.soundVolume.value = String(config.behaviour.soundVolume)
  els.soundVolumeVal.textContent = String(config.behaviour.soundVolume)
  els.memory.checked = config.behaviour.memory
  await renderMemories()
  els.statusEnabled.checked = config.behaviour.status
  renderStatus(await window.syrup.status.get())
  els.hkChat.value = config.hotkeys.toggleChat
  els.hkClip.value = config.hotkeys.analyzeClipboard
  els.hkPet.value = config.hotkeys.togglePet

  els.provider.addEventListener('change', () => {
    // keep edits to the previous provider before switching
    captureProviderFields(config.provider)
    config.provider = els.provider.value as LLMProviderId
    loadProviderFields(config.provider)
  })

  els.proximityRadius.addEventListener('input', () => {
    els.proximityVal.textContent = els.proximityRadius.value
  })

  els.soundVolume.addEventListener('input', () => {
    els.soundVolumeVal.textContent = els.soundVolume.value
  })

  els.memoryClear.addEventListener('click', () => {
    void window.syrup.memory.clear().then(renderMemories)
  })

  els.statusReset.addEventListener('click', () => {
    void window.syrup.status.reset().then(renderStatus)
  })
  // Reflect the dim/undim immediately as the toggle flips (saved on 儲存).
  els.statusEnabled.addEventListener('change', () =>
    els.statusBars.classList.toggle('disabled', !els.statusEnabled.checked)
  )
  // Live: the manager pushes new values on every decay tick / interaction.
  window.syrup.status.onChanged((s) => renderStatus(s))

  els.save.addEventListener('click', () => void save())
  els.close.addEventListener('click', () => window.syrup.window.close())
}

async function save(): Promise<void> {
  const selected = els.provider.value as LLMProviderId
  captureProviderFields(selected)

  const patch: Partial<AppConfig> = {
    provider: selected,
    providers: config.providers,
    character: els.character.value,
    persona: els.persona.value,
    behaviour: {
      followCursor: els.followCursor.checked,
      useEnvironmentContext: els.useEnvironmentContext.checked,
      proximityRadius: Number(els.proximityRadius.value),
      proactive: els.proactive.checked,
      watchClipboard: els.watchClipboard.checked,
      sound: els.sound.checked,
      soundVolume: Number(els.soundVolume.value),
      memory: els.memory.checked,
      status: els.statusEnabled.checked
    },
    launchOnStartup: els.launchOnStartup.checked,
    hotkeys: {
      toggleChat: els.hkChat.value.trim(),
      analyzeClipboard: els.hkClip.value.trim(),
      togglePet: els.hkPet.value.trim()
    }
  }

  config = await window.syrup.config.set(patch)
  els.status.textContent = '✓ 已儲存'
  window.setTimeout(() => (els.status.textContent = ''), 2000)
}

void init()
