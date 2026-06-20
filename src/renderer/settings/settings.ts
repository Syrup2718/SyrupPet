import type { AppConfig, LLMProviderId } from '@shared/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

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
  launchOnStartup: $<HTMLInputElement>('launchOnStartup'),
  proximityRadius: $<HTMLInputElement>('proximityRadius'),
  proximityVal: $<HTMLSpanElement>('proximityVal'),
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

async function init(): Promise<void> {
  config = await window.syrup.config.get()

  els.provider.value = config.provider
  loadProviderFields(config.provider)
  els.character.value = config.character
  els.persona.value = config.persona
  els.followCursor.checked = config.behaviour.followCursor
  els.useEnvironmentContext.checked = config.behaviour.useEnvironmentContext
  els.proactive.checked = config.behaviour.proactive
  els.launchOnStartup.checked = config.launchOnStartup
  els.proximityRadius.value = String(config.behaviour.proximityRadius)
  els.proximityVal.textContent = String(config.behaviour.proximityRadius)
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
      proactive: els.proactive.checked
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
