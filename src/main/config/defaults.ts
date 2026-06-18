import type { AppConfig } from '@shared/types'

/**
 * Default persona for 小漿糖. Keep it short — the structured-output rules are
 * added separately in the LLM prompt builder.
 */
export const DEFAULT_PERSONA = [
  '你是「小漿糖」，一隻住在使用者 Windows 桌面上的 AI 桌寵。',
  '個性：可愛、有點黏人、好奇心強，會用輕鬆口語的繁體中文跟使用者互動。',
  '你會陪使用者工作、聊天、看錯誤訊息、給鼓勵。回答簡短自然，像朋友而不是客服。'
].join('\n')

export const DEFAULT_CONFIG: AppConfig = {
  provider: 'deepseek',
  providers: {
    openai: {
      id: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini'
    },
    deepseek: {
      id: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat'
    },
    ollama: {
      id: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'ollama',
      model: 'llama3.1'
    },
    custom: {
      id: 'custom',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKey: '',
      model: 'local-model'
    }
  },
  character: 'default',
  persona: DEFAULT_PERSONA,
  hotkeys: {
    toggleChat: 'CommandOrControl+Shift+Space',
    analyzeClipboard: 'CommandOrControl+Shift+C',
    togglePet: 'CommandOrControl+Shift+P'
  },
  behaviour: {
    followCursor: true,
    useEnvironmentContext: true,
    proximityRadius: 180
  },
  launchOnStartup: false
}
