import type { SyrupApi } from '@shared/api'

declare global {
  interface Window {
    syrup: SyrupApi
  }
}

export {}
