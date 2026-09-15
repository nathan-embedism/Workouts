import { useCallback, useEffect, useRef, useState } from 'react'

/** Hash routing, so the phone's back gesture works without a router dependency. */
export function useRoute(): [string, (to: string, opts?: { replace?: boolean }) => void] {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)

  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const hash = `#${to}`
    if (window.location.hash === hash) return
    if (opts?.replace) window.location.replace(hash)
    else window.location.hash = hash
    setRoute(to)
  }, [])

  return [route, navigate]
}

/** Keeps the screen on during a workout, and re-acquires it after a tab switch. */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let cancelled = false

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { void lock.release(); return }
        lockRef.current = lock
      } catch { /* denied, low battery, or unsupported */ }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !lockRef.current) void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lockRef.current?.release().catch(() => undefined)
      lockRef.current = null
    }
  }, [active])
}

let audioContext: AudioContext | null = null

/** Short beep. Needs a prior user gesture on iOS, which a workout always has. */
export function beep(frequency = 880, durationMs = 160, volume = 0.22) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioContext ??= new Ctor()
    if (audioContext.state === 'suspended') void audioContext.resume()

    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'square'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(volume, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000)
    osc.connect(gain).connect(audioContext.destination)
    osc.start()
    osc.stop(audioContext.currentTime + durationMs / 1000)
  } catch { /* audio unavailable */ }
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

/** Counts up from a start time — used for total session duration. */
export function useElapsed(startedAt?: string): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!startedAt) return 0
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000)
}

/** Clipboard with a textarea fallback for older iOS and non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function downloadFile(filename: string, contents: string, type = 'application/json') {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface StorageStatus {
  supported: boolean
  /** The browser has promised not to evict this data to reclaim space. */
  persisted: boolean
  usageBytes?: number
  quotaBytes?: number
}

/**
 * What the browser will say about the durability of what we've saved. Safari
 * grants persistence largely on whether the app was added to the home screen.
 */
export function useStorageStatus(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>({ supported: false, persisted: false })

  useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (!navigator.storage?.estimate) return
      try {
        const [estimate, persisted] = await Promise.all([
          navigator.storage.estimate(),
          navigator.storage.persisted?.() ?? Promise.resolve(false),
        ])
        if (cancelled) return
        setStatus({
          supported: true,
          persisted,
          usageBytes: estimate.usage,
          quotaBytes: estimate.quota,
        })
      } catch { /* unsupported or blocked */ }
    }
    void read()
    return () => { cancelled = true }
  }, [])

  return status
}

/** Ask the browser to protect this origin's data. Resolves to the new state. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** True once the app is running from the home screen rather than a browser tab. */
export function useIsStandalone(): boolean {
  const [standalone] = useState(() => {
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
    return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
  })
  return standalone
}
