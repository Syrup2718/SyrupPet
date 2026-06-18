import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_CONFIG } from './defaults'

/**
 * Tiny JSON-file config store. Lives in the OS userData folder so it survives
 * reinstalls and keeps API keys out of the repo. Intentionally dependency-free
 * (no electron-store) to keep the v1 surface small.
 *
 * Reads are deep-merged over DEFAULT_CONFIG so adding new config fields in code
 * never breaks an existing user's file.
 */
class ConfigStore {
  private filePath: string
  private cache: AppConfig

  constructor() {
    this.filePath = join(app.getPath('userData'), 'config.json')
    this.cache = this.load()
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        return mergeConfig(DEFAULT_CONFIG, raw)
      }
    } catch (err) {
      console.error('[config] failed to read config, using defaults:', err)
    }
    return structuredClone(DEFAULT_CONFIG)
  }

  get(): AppConfig {
    return this.cache
  }

  /** Shallow-ish update: callers pass a partial; we deep-merge and persist. */
  set(patch: Partial<AppConfig>): AppConfig {
    this.cache = mergeConfig(this.cache, patch)
    this.persist()
    return this.cache
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8')
    } catch (err) {
      console.error('[config] failed to persist config:', err)
    }
  }
}

/** Recursive merge of plain objects; arrays and primitives are replaced. */
function mergeConfig<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return (patch === undefined ? base : (patch as T))
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)?.[key]
    if (
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = mergeConfig(baseVal, value)
    } else {
      out[key] = value
    }
  }
  return out as T
}

let instance: ConfigStore | null = null
/** Lazily created so it's only built after `app` is ready. */
export function getConfigStore(): ConfigStore {
  if (!instance) instance = new ConfigStore()
  return instance
}
