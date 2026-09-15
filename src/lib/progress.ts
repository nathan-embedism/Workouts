import type { Session, SetLog, Units } from '../types'
import { convertWeight, roundLoad } from './format'
import { normaliseName } from './history'

/** One session's worth of work on a single exercise. */
export interface ExercisePoint {
  sessionId: string
  date: string
  /** Heaviest working set, in display units. Warm-ups are excluded throughout. */
  topWeight?: number
  volume?: number
  totalReps?: number
  totalSeconds?: number
  totalDistance?: number
  distanceUnit?: string
  avgRpe?: number
  sets: number
}

export interface ExerciseSeries {
  name: string
  key: string
  points: ExercisePoint[]
  lastDate: string
  hasWeight: boolean
  hasReps: boolean
  hasDuration: boolean
  hasDistance: boolean
}

const isCounted = (log: SetLog) => !log.skipped && log.setType !== 'warmup'

function mean(values: number[]): number | undefined {
  if (!values.length) return undefined
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function sum(values: number[]): number | undefined {
  if (!values.length) return undefined
  return roundLoad(values.reduce((a, b) => a + b, 0))
}

/**
 * Everything the user has logged, grouped by exercise then by session, ready to
 * plot. Ordered by most recently trained.
 */
export function buildExerciseSeries(sessions: Session[], units: Units): ExerciseSeries[] {
  const byKey = new Map<string, ExerciseSeries>()

  const finished = sessions
    .filter((s) => s.endedAt && s.logs.length)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  for (const session of finished) {
    const perExercise = new Map<string, SetLog[]>()
    for (const log of session.logs) {
      if (!isCounted(log)) continue
      const key = normaliseName(log.exerciseName)
      const list = perExercise.get(key) ?? []
      list.push(log)
      perExercise.set(key, list)
    }

    for (const [key, logs] of perExercise) {
      const weights = logs.filter((l) => l.weight !== undefined)
        .map((l) => convertWeight(l.weight!, l.units, units))
      const volumes = logs
        .filter((l) => l.weight !== undefined && l.reps !== undefined)
        .map((l) => convertWeight(l.weight!, l.units, units) * l.reps!)
      const reps = logs.filter((l) => l.reps !== undefined).map((l) => l.reps!)
      const seconds = logs.filter((l) => l.durationSeconds !== undefined).map((l) => l.durationSeconds!)
      const distances = logs.filter((l) => l.distance !== undefined).map((l) => l.distance!)
      const rpes = logs.filter((l) => l.rpe !== undefined).map((l) => l.rpe!)

      const point: ExercisePoint = {
        sessionId: session.id,
        date: session.startedAt,
        topWeight: weights.length ? roundLoad(Math.max(...weights)) : undefined,
        volume: sum(volumes),
        totalReps: reps.length ? reps.reduce((a, b) => a + b, 0) : undefined,
        totalSeconds: seconds.length ? seconds.reduce((a, b) => a + b, 0) : undefined,
        totalDistance: sum(distances),
        distanceUnit: logs.find((l) => l.distanceUnit)?.distanceUnit,
        avgRpe: mean(rpes),
        sets: logs.length,
      }

      const existing = byKey.get(key)
      if (existing) {
        existing.points.push(point)
        existing.lastDate = session.startedAt
      } else {
        byKey.set(key, {
          key,
          name: logs[0].exerciseName,
          points: [point],
          lastDate: session.startedAt,
          hasWeight: false,
          hasReps: false,
          hasDuration: false,
          hasDistance: false,
        })
      }
    }
  }

  const series = [...byKey.values()]
  for (const item of series) {
    item.hasWeight = item.points.some((p) => p.topWeight !== undefined)
    item.hasReps = item.points.some((p) => p.totalReps !== undefined)
    item.hasDuration = item.points.some((p) => p.totalSeconds !== undefined)
    item.hasDistance = item.points.some((p) => p.totalDistance !== undefined)
  }

  return series.sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

export interface Trend {
  /** Change from the first to the most recent session, as a percentage. */
  percent: number
  from: number
  to: number
}

export function trendOf(values: (number | undefined)[]): Trend | undefined {
  const present = values.filter((v): v is number => v !== undefined)
  if (present.length < 2) return undefined
  const from = present[0]
  const to = present[present.length - 1]
  if (from === 0) return undefined
  return { percent: Math.round(((to - from) / from) * 100), from, to }
}

/** Best single set ever recorded, for the personal-best line. */
export function personalBest(series: ExerciseSeries): ExercisePoint | undefined {
  return series.points
    .filter((p) => p.topWeight !== undefined)
    .sort((a, b) => (b.topWeight ?? 0) - (a.topWeight ?? 0))[0]
}
