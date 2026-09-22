import type { Session, SetLog, Settings, Units } from '../types'
import { convertWeight, formatLoad, relativeDays, roundLoad } from './format'

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface LastTime {
  sessionId: string
  date: string
  when: string
  logs: SetLog[]
  /** "60 kg × 8 · 60 × 8 · 57.5 × 6" */
  detail: string
  /** "55–65 kg" when the load moved, "60 kg" when it did not. */
  loadRange?: string
  settingsRange?: string
  rpe?: string
}

function numbersRange(values: number[], suffix = ''): string | undefined {
  if (!values.length) return undefined
  const min = roundLoad(Math.min(...values))
  const max = roundLoad(Math.max(...values))
  return min === max ? `${min}${suffix}` : `${min}–${max}${suffix}`
}

/**
 * What the user did the last time they hit this exercise — the headline the
 * runner shows above the logging controls.
 */
export function lastTimeFor(
  sessions: Session[],
  exerciseName: string,
  units: Units,
  excludeSessionId?: string,
): LastTime | undefined {
  const key = normaliseName(exerciseName)
  const candidates = sessions
    .filter((s) => s.id !== excludeSessionId)
    .filter((s) => s.logs.some((l) => normaliseName(l.exerciseName) === key && !l.skipped))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  const session = candidates[0]
  if (!session) return undefined

  const logs = session.logs
    .filter((l) => normaliseName(l.exerciseName) === key && !l.skipped)
    .sort((a, b) => a.round - b.round || a.setIndex - b.setIndex)

  const detail = logs
    .map((log) => {
      const bits: string[] = []
      if (log.weight !== undefined) bits.push(String(roundLoad(convertWeight(log.weight, log.units, units))))
      if (log.reps !== undefined) bits.push(`× ${log.reps}`)
      if (!bits.length && log.durationSeconds !== undefined) bits.push(`${Math.round(log.durationSeconds / 60)}m`)
      if (!bits.length && log.distance !== undefined) bits.push(`${log.distance}${log.distanceUnit ?? ''}`)
      if (!bits.length && log.level !== undefined) bits.push(`L${log.level}`)
      return bits.join(' ')
    })
    .filter(Boolean)
    .join(' · ')

  const weights = logs
    .filter((l) => l.weight !== undefined)
    .map((l) => convertWeight(l.weight!, l.units, units))
  const loadRange = weights.length ? numbersRange(weights, ` ${units}`) : undefined

  const settingBits: string[] = []
  const inclines = logs.filter((l) => l.incline !== undefined).map((l) => l.incline!)
  const levels = logs.filter((l) => l.level !== undefined).map((l) => l.level!)
  const speeds = logs.filter((l) => l.speed !== undefined).map((l) => l.speed!)
  const incline = numbersRange(inclines)
  const level = numbersRange(levels)
  const speed = numbersRange(speeds)
  if (incline) settingBits.push(`incline ${incline}`)
  if (level) settingBits.push(`level ${level}`)
  if (speed) settingBits.push(`speed ${speed}`)

  const rpes = logs.filter((l) => l.rpe !== undefined).map((l) => l.rpe!)
  const rpe = numbersRange(rpes)

  return {
    sessionId: session.id,
    date: session.startedAt,
    when: relativeDays(session.startedAt),
    logs,
    detail,
    loadRange,
    settingsRange: settingBits.length ? settingBits.join(' · ') : undefined,
    rpe: rpe ? `RPE ${rpe}` : undefined,
  }
}

export interface BackupStatus {
  due: boolean
  unsavedSessions: number
  daysSinceExport?: number
  message: string
}

export function backupStatus(settings: Settings, sessions: Session[]): BackupStatus {
  const finished = sessions.filter((s) => s.endedAt)
  const exportedCount = settings.lastExportSessionCount ?? 0
  const unsavedSessions = Math.max(0, finished.length - exportedCount)

  const daysSinceExport = settings.lastExportAt
    ? Math.floor((Date.now() - new Date(settings.lastExportAt).getTime()) / 86_400_000)
    : undefined

  if (finished.length === 0) {
    return { due: false, unsavedSessions: 0, daysSinceExport, message: 'Nothing to back up yet.' }
  }
  if (!settings.lastExportAt) {
    return {
      due: true,
      unsavedSessions,
      message: `${finished.length} workout${finished.length === 1 ? '' : 's'} logged and never backed up. This data only lives on this device.`,
    }
  }

  const bySessions = unsavedSessions >= settings.remindAfterSessions
  const byDays = daysSinceExport !== undefined && daysSinceExport >= settings.remindAfterDays && unsavedSessions > 0

  if (bySessions || byDays) {
    const parts = [`${unsavedSessions} workout${unsavedSessions === 1 ? '' : 's'} since your last backup`]
    if (daysSinceExport !== undefined) parts.push(`${daysSinceExport} day${daysSinceExport === 1 ? '' : 's'} ago`)
    return { due: true, unsavedSessions, daysSinceExport, message: `${parts.join(' · ')}.` }
  }

  return {
    due: false,
    unsavedSessions,
    daysSinceExport,
    message: unsavedSessions
      ? `${unsavedSessions} workout${unsavedSessions === 1 ? '' : 's'} not yet backed up.`
      : 'Everything is backed up.',
  }
}

/** Plain-text digest of recent training, for pasting back into an AI tool. */
export function progressSummary(
  sessions: Session[],
  units: Units,
  limit = 12,
  includeUnfinished = false,
): string {
  const finished = sessions
    .filter((s) => (includeUnfinished || s.endedAt) && s.logs.length)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)

  if (!finished.length) return 'No completed workouts logged yet.'

  const lines: string[] = []
  for (const session of finished.reverse()) {
    const date = new Date(session.startedAt).toISOString().slice(0, 10)
    const minutes = session.endedAt
      ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000)
      : undefined
    lines.push(`\n${date} — ${session.dayName} (${session.planName})${minutes ? `, ${minutes} min` : ''}`)

    const byExercise = new Map<string, SetLog[]>()
    for (const log of session.logs) {
      const list = byExercise.get(log.exerciseName) ?? []
      list.push(log)
      byExercise.set(log.exerciseName, list)
    }

    for (const [name, logs] of byExercise) {
      const parts = logs
        .sort((a, b) => a.round - b.round || a.setIndex - b.setIndex)
        .map((log) => {
          if (log.skipped) return 'skipped'
          const bits: string[] = []
          if (log.weight !== undefined) bits.push(formatLoad(convertWeight(log.weight, log.units, units), units))
          if (log.reps !== undefined) bits.push(`× ${log.reps}`)
          if (log.incline !== undefined) bits.push(`incline ${log.incline}`)
          if (log.level !== undefined) bits.push(`level ${log.level}`)
          if (log.speed !== undefined) bits.push(`speed ${log.speed}`)
          if (log.distance !== undefined) bits.push(`${log.distance}${log.distanceUnit ?? ''}`)
          if (log.durationSeconds !== undefined) bits.push(`${Math.round(log.durationSeconds / 60)}m`)
          if (log.rpe !== undefined) bits.push(`@RPE ${log.rpe}`)
          // Whatever the user typed against the set itself — often the useful part.
          if (log.notes) bits.push(`(${log.notes})`)
          return bits.join(' ') || 'done'
        })
      lines.push(`  ${name}: ${parts.join(' | ')}`)
    }
    if (session.notes) lines.push(`  Note: ${session.notes}`)
  }

  return `Units: ${units}${lines.join('\n')}`
}
