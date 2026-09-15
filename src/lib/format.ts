import type { Units, WorkoutSet } from '../types'

export function clockTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function durationWords(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  if (safe < 60) return `${safe}s`
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function roundLoad(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatLoad(value: number, units: Units): string {
  return `${roundLoad(value)} ${units}`
}

/** "8-12 reps", "10 reps", "AMRAP" — the headline target for a set. */
export function repsTarget(set: WorkoutSet): string | undefined {
  if (set.type === 'amrap') return 'AMRAP'
  if (set.repRange) return `${set.repRange[0]}–${set.repRange[1]}`
  if (set.reps !== undefined) return String(set.reps)
  if (set.type === 'failure') return 'To failure'
  return undefined
}

export function setTypeLabel(set: WorkoutSet): string {
  switch (set.type) {
    case 'warmup': return 'Warm-up'
    case 'amrap': return 'AMRAP'
    case 'timed': return 'Timed'
    case 'distance': return 'Distance'
    case 'failure': return 'To failure'
    default: return 'Working set'
  }
}

/** The one-line description of what the plan is asking for on this step. */
export function setTargetLine(set: WorkoutSet, units: Units): string {
  const parts: string[] = []
  const reps = repsTarget(set)
  if (reps) parts.push(`${reps} reps`)
  if (set.targetWeight !== undefined) parts.push(formatLoad(set.targetWeight, units))
  else if (set.targetWeightPercent !== undefined) parts.push(`${set.targetWeightPercent}% 1RM`)
  if (set.targetDistance) parts.push(`${set.targetDistance.value} ${set.targetDistance.unit}`)
  if (set.durationSeconds) parts.push(durationWords(set.durationSeconds))
  if (set.targetSpeed !== undefined) parts.push(`speed ${set.targetSpeed}`)
  if (set.targetIncline !== undefined) parts.push(`incline ${set.targetIncline}`)
  if (set.targetLevel !== undefined) parts.push(`level ${set.targetLevel}`)
  if (set.tempo) parts.push(`tempo ${set.tempo}`)
  return parts.join(' · ')
}

export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function relativeDays(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return `${Math.floor(days / 7)} weeks ago`
}

export function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function convertWeight(value: number, from: Units, to: Units): number {
  if (from === to) return value
  return from === 'kg' ? roundLoad(value * 2.20462) : roundLoad(value / 2.20462)
}
