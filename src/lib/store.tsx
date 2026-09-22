import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type { AppData, Session, SetLog, Settings, StoredPlan, WorkoutPlan } from '../types'
import {
  STORAGE_KEY, emptyData, loadData, migrate, readSnapshot, snapshot, type LoadResult,
} from './storage'

// Re-exported so screens have one place to import persistence helpers from.
export { DEFAULT_SETTINGS, loadData, migrate, readRescued, serialiseBackup } from './storage'

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
  recovery?: { message: string; rescuedKey?: string }
  dismissRecovery: () => void
  snapshotAvailable: boolean
  undoRestore: () => boolean
  importPlan: (plan: WorkoutPlan) => string
  appendDays: (planId: string, incoming: WorkoutPlan) => number
  removePlan: (id: string) => void
  setActivePlan: (id: string) => void
  startSession: (planId: string, dayId: string, dayName: string, planName: string) => string
  logSet: (log: SetLog) => void
  setStepIndex: (sessionId: string, index: number) => void
  deferStep: (sessionId: string, stepId: string) => void
  swapExercise: (sessionId: string, exerciseId: string, name?: string) => void
  finishSession: (sessionId: string, notes?: string) => void
  setSessionNotes: (sessionId: string, notes?: string) => void
  abandonSession: (sessionId: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  saveDraft: (draft: Record<string, unknown>) => void
  markExported: () => void
  replaceAll: (data: AppData) => void
  mergeBackup: (incoming: AppData) => { plans: number; sessions: number }
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState<LoadResult>(() => loadData())
  const [data, setData] = useState<AppData>(loaded.data)
  const [storageError, setStorageError] = useState<string | undefined>()
  const [recovery, setRecovery] = useState(loaded.recovery)
  const [snapshotAvailable, setSnapshotAvailable] = useState(() => !!readSnapshot())
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

  /**
   * Add days from a second import into an existing plan, so a long plan can be
   * generated a few days at a time instead of in one huge reply.
   */
  const appendDays = useCallback((planId: string, incoming: WorkoutPlan) => {
    let added = 0
    setData((prev) => ({
      ...prev,
      plans: prev.plans.map((stored) => {
        if (stored.id !== planId) return stored
        const usedIds = new Set(stored.plan.days.map((d) => d.id))
        const days = incoming.days.map((day, i) => {
          let id = day.id
          while (usedIds.has(id)) id = `${day.id}-${stored.plan.days.length + i + 1}`
          usedIds.add(id)
          return { ...day, id, dayNumber: stored.plan.days.length + i + 1 }
        })
        added = days.length
        return {
          ...stored,
          plan: {
            ...stored.plan,
            days: [...stored.plan.days, ...days],
            // Later batches may carry plan-level detail the first one lacked.
            notes: stored.plan.notes ?? incoming.notes,
            events: [...(stored.plan.events ?? []), ...(incoming.events ?? [])],
            durationWeeks: stored.plan.durationWeeks ?? incoming.durationWeeks,
            daysPerWeek: stored.plan.daysPerWeek ?? incoming.daysPerWeek,
          },
        }
      }),
    }))
    return added
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

  /** Put a set off to the end of the workout — or, if it was already put off, to the new end. */
  const deferStep = useCallback((sessionId: string, stepId: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId
        ? { ...s, deferredStepIds: [...(s.deferredStepIds ?? []).filter((id) => id !== stepId), stepId] }
        : s)),
    }))
  }, [])

  /** Do something else instead, for the rest of this workout. No name puts the plan's exercise back. */
  const swapExercise = useCallback((sessionId: string, exerciseId: string, name?: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const swaps = { ...(s.swaps ?? {}) }
        if (name?.trim()) swaps[exerciseId] = name.trim()
        else delete swaps[exerciseId]
        return { ...s, swaps }
      }),
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

  /** Edit the freeform note on a workout, including long after it finished. */
  const setSessionNotes = useCallback((sessionId: string, notes?: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, notes } : s)),
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
    // Keep what is being replaced, so a mistaken restore or wipe is recoverable.
    snapshot()
    setSnapshotAvailable(true)
    setData(migrate({ ...emptyData(), ...incoming }).data)
  }, [])

  const undoRestore = useCallback(() => {
    const previous = readSnapshot()
    if (!previous) return false
    setData(previous)
    return true
  }, [])

  const dismissRecovery = useCallback(() => setRecovery(undefined), [])

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
    recovery,
    dismissRecovery,
    snapshotAvailable,
    undoRestore,
    importPlan, appendDays, removePlan, setActivePlan, startSession, logSet, setStepIndex,
    deferStep, swapExercise, finishSession, setSessionNotes, abandonSession, updateSettings,
    saveDraft, markExported, replaceAll, mergeBackup,
  }), [
    data, storageError, recovery, dismissRecovery, snapshotAvailable, undoRestore,
    importPlan, appendDays, removePlan, setActivePlan, startSession, logSet,
    setStepIndex, deferStep, swapExercise, finishSession, setSessionNotes, abandonSession,
    updateSettings, saveDraft, markExported, replaceAll, mergeBackup,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}
