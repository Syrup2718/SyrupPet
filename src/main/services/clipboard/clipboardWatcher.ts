import { clipboard } from 'electron'

const POLL_MS = 4000

/**
 * Strong-ish signals that a copied blob is an error / stack trace, not prose.
 * Kept conservative to limit false positives — this is an opt-in feature.
 */
const ERROR_SIGNAL =
  /(\b(error|exception|traceback|stack ?trace|errno|panic|fatal|segfault)\b|[A-Za-z]+Error\b|[A-Za-z]+Exception\b|is not defined|cannot read propert|unhandled (promise )?rejection|錯誤|例外)/i

function looksLikeError(text: string): boolean {
  const t = text.trim()
  if (t.length < 12 || t.length > 8000) return false
  return ERROR_SIGNAL.test(t)
}

/**
 * Opt-in clipboard watcher. When (and only when) enabled, it polls the clipboard
 * and, on a *change* that looks like an error, calls `onError` so the pet can
 * OFFER to help. It never forwards the clipboard text anywhere — the actual
 * read-and-analyse still only happens on the user's explicit hotkey.
 *
 * Privacy: while disabled it never calls clipboard.readText() at all, and it
 * primes its baseline on enable so it won't fire on whatever was already copied.
 */
export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastText = ''
  private primed = false

  constructor(
    private readonly isEnabled: () => boolean,
    private readonly onError: () => void
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    if (!this.isEnabled()) {
      this.primed = false // re-baseline next time it's turned on
      return
    }
    const text = clipboard.readText()
    if (!this.primed) {
      // first read after enabling: set baseline, don't fire on existing content
      this.lastText = text
      this.primed = true
      return
    }
    if (text === this.lastText) return
    this.lastText = text
    if (looksLikeError(text)) this.onError()
  }
}
