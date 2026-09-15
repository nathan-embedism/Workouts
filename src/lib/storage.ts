import type { AppData, Settings } from '../types'

export const STORAGE_KEY = 'neon-sets:v1'
/** Taken before anything destructive (a restore, a wipe) so it can be undone. */
const SNAPSHOT_KEY = 'neon-sets:v1:previous'
const CURRENT_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  weightIncrement: 2.5,
  autoStartRest: true,
  sound: true,
  vibrate: true,
  keepAwake: true,
  remindAfterSessions: 4,
  remindAfterDays: 10,
}

export function emptyData(): AppData {
  return { version: CURRENT_VERSION, settings: { ...DEFAULT_SETTINGS }, plans: [], sessions: [] }
}

export interface LoadResult {
  data: AppData
  /** Set when something was wrong with what was on disk, for the UI to surface. */
  recovery?: { message: string; rescuedKey?: string }
}

/**
 * Read what is on the device.
 *
 * Two rules keep an app update from eating a training log:
 *   1. unknown fields are carried through untouched, so a build that predates a
 *      field (or a rollback to one) cannot strip it;
 *   2. nothing is ever deleted — unreadable data is moved aside under its own
 *      key and reported, never silently replaced with an empty store.
 */
export function migrate(parsed: unknown): LoadResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { data: emptyData(), recovery: { message: 'Saved data was not in the expected format.' } }
  }

  const raw = parsed as Partial<AppData> & Record<string, unknown>
  const storedVersion = typeof raw.version === 'number' ? raw.version : CURRENT_VERSION

  const data: AppData = {
    // Spread first: anything this build does not know about survives the round trip.
    ...(raw as object),
    version: CURRENT_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    plans: Array.isArray(raw.plans) ? raw.plans : [],
    activePlanId: raw.activePlanId,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    builderDraft: raw.builderDraft,
  }

  if (storedVersion > CURRENT_VERSION) {
    return {
      data,
      recovery: {
        message: `This data was saved by a newer version of the app (v${storedVersion}). Everything has been kept, but update the app before making big changes.`,
      },
    }
  }

  return { data }
}

export function loadData(): LoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: emptyData(), recovery: { message: 'This browser is blocking local storage, so nothing can be saved. Private browsing usually causes this.' } }
  }
  if (!raw) return { data: emptyData() }

  try {
    return migrate(JSON.parse(raw))
  } catch {
    // Unreadable. Move it aside under its own key rather than overwriting it,
    // so the user still has something to hand to a recovery attempt.
    const rescuedKey = `${STORAGE_KEY}:unreadable:${Date.now()}`
    try {
      localStorage.setItem(rescuedKey, raw)
    } catch { /* out of space; the original is still in place either way */ }
    return {
      data: emptyData(),
      recovery: {
        message: 'Your saved data could not be read, so the app started empty. The original has been kept aside — export it before logging anything new.',
        rescuedKey,
      },
    }
  }
}

/** Anything written here can be restored from the Data tab afterwards. */
export function snapshot(): void {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) localStorage.setItem(SNAPSHOT_KEY, current)
  } catch { /* nothing to lose if this fails */ }
}

export function readSnapshot(): AppData | undefined {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return undefined
    return migrate(JSON.parse(raw)).data
  } catch {
    return undefined
  }
}

export function readRescued(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

export function serialiseBackup(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'neon-sets' }, null, 2)
}
