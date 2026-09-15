import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type { AppData, Session, SetLog, Settings, StoredPlan, WorkoutPlan } from '../types'

const STORAGE_KEY = 'neon-sets:v1'

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

function emptyData(): AppData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, plans: [], sessions: [] }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      activePlanId: parsed.activePlanId,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      builderDraft: parsed.builderDraft,
    }
  } catch {
    // A corrupt store should not brick the app — start clean but keep the bad
    // copy around in case the user wants to recover it.
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw)
    } catch { /* storage unavailable */ }
    return emptyData()
  }
}

export function serialiseBackup(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'neon-sets' }, null, 2)
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface StoreValue {
  data: AppData
  settings: Settings
  plans: StoredPlan[]
  sessions: Session[]
  activePlan?: StoredPlan
  activeSession?: Session
  storageError?: string
  importPlan: (plan: WorkoutPlan) => string
  removePlan: (id: string) => void
  setActivePlan: (id: string) => void
  startSession: (planId: string, dayId: string, dayName: string, planName: string) => string
  logSet: (log: SetLog) => void
  setStepIndex: (sessionId: string, index: number) => void
  finishSession: (sessionId: string, notes?: string) => void
  abandonSession: (sessionId: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  saveDraft: (draft: Record<string, unknown>) => void
  markExported: () => void
  replaceAll: (data: AppData) => void
  mergeBackup: (incoming: AppData) => { plans: number; sessions: number }
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [storageError, setStorageError] = useState<string | undefined>()
  const firstRun = useRef(true)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      // Ask the browser not to evict us — matters most for installed iOS/Android PWAs.
      void navigator.storage?.persist?.().catch(() => undefined)
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      setStorageError(undefined)
    } catch (e) {
      setStorageError(
        e instanceof Error && e.name === 'QuotaExceededError'
          ? 'Device storage is full — export a backup and delete old sessions.'
          : 'Could not save to this device. Export a backup before you close the app.',
      )
    }
  }, [data])

  const importPlan = useCallback((plan: WorkoutPlan) => {
    const id = newId('plan')
    setData((prev) => ({
      ...prev,
      plans: [{ id, importedAt: new Date().toISOString(), plan }, ...prev.plans],
      activePlanId: id,
      settings: { ...prev.settings, units: plan.units },
    }))
    return id
  }, [])

  const removePlan = useCallback((id: string) => {
    setData((prev) => {
      const plans = prev.plans.filter((p) => p.id !== id)
      return {
        ...prev,
        plans,
        activePlanId: prev.activePlanId === id ? plans[0]?.id : prev.activePlanId,
      }
    })
  }, [])

  const setActivePlan = useCallback((id: string) => {
    setData((prev) => {
      const plan = prev.plans.find((p) => p.id === id)
      return {
        ...prev,
        activePlanId: id,
        settings: plan ? { ...prev.settings, units: plan.plan.units } : prev.settings,
      }
    })
  }, [])

  const startSession = useCallback((planId: string, dayId: string, dayName: string, planName: string) => {
    const id = newId('sess')
    setData((prev) => ({
      ...prev,
      sessions: [
        // Only one session runs at a time; anything still open was abandoned.
        ...prev.sessions.filter((s) => s.endedAt || s.logs.length > 0),
        {
          id,
          planId,
          planName,
          dayId,
          dayName,
          startedAt: new Date().toISOString(),
          units: prev.settings.units,
          logs: [],
          stepIndex: 0,
        },
      ],
    }))
    return id
  }, [])

  const logSet = useCallback((log: SetLog) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== log.sessionId) return session
        const logs = session.logs.filter((l) => l.stepId !== log.stepId)
        return { ...session, logs: [...logs, log] }
      }),
    }))
  }, [])

  const setStepIndex = useCallback((sessionId: string, index: number) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, stepIndex: index } : s)),
    }))
  }, [])

  const finishSession = useCallback((sessionId: string, notes?: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, endedAt: new Date().toISOString(), notes } : s,
      ),
    }))
  }, [])

  const abandonSession = useCallback((sessionId: string) => {
    setData((prev) => ({ ...prev, sessions: prev.sessions.filter((s) => s.id !== sessionId) }))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const saveDraft = useCallback((draft: Record<string, unknown>) => {
    setData((prev) => ({ ...prev, builderDraft: draft }))
  }, [])

  const markExported = useCallback(() => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        lastExportAt: new Date().toISOString(),
        lastExportSessionCount: prev.sessions.filter((s) => s.endedAt).length,
      },
    }))
  }, [])

  const replaceAll = useCallback((incoming: AppData) => {
    setData({ ...emptyData(), ...incoming, version: 1 })
  }, [])

  const mergeBackup = useCallback((incoming: AppData) => {
    let addedPlans = 0
    let addedSessions = 0
    setData((prev) => {
      const planIds = new Set(prev.plans.map((p) => p.id))
      const newPlans = (incoming.plans ?? []).filter((p) => !planIds.has(p.id))
      const sessionIds = new Set(prev.sessions.map((s) => s.id))
      const newSessions = (incoming.sessions ?? []).filter((s) => !sessionIds.has(s.id))
      addedPlans = newPlans.length
      addedSessions = newSessions.length
      return {
        ...prev,
        plans: [...newPlans, ...prev.plans],
        sessions: [...prev.sessions, ...newSessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
        activePlanId: prev.activePlanId ?? incoming.activePlanId,
      }
    })
    return { plans: addedPlans, sessions: addedSessions }
  }, [])

  const value = useMemo<StoreValue>(() => ({
    data,
    settings: data.settings,
    plans: data.plans,
    sessions: data.sessions,
    activePlan: data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0],
    activeSession: [...data.sessions].reverse().find((s) => !s.endedAt),
    storageError,
    importPlan, removePlan, setActivePlan, startSession, logSet, setStepIndex,
    finishSession, abandonSession, updateSettings, saveDraft, markExported,
    replaceAll, mergeBackup,
  }), [
    data, storageError, importPlan, removePlan, setActivePlan, startSession, logSet,
    setStepIndex, finishSession, abandonSession, updateSettings, saveDraft, markExported,
    replaceAll, mergeBackup,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}
