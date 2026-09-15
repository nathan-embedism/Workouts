import type { PlanDay, Session, WorkoutPlan } from '../types'

/**
 * Where the user is up to: the day after the last one they finished, skipping
 * rest days and wrapping round to the start of the plan.
 */
export function nextDayFor(plan: WorkoutPlan, sessions: Session[], planId: string): PlanDay | undefined {
  const trainable = plan.days.filter((d) => d.type !== 'rest' && d.blocks.length > 0)
  if (!trainable.length) return undefined

  const lastDone = sessions
    .filter((s) => s.planId === planId && s.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

  if (!lastDone) return trainable[0]

  const lastIndex = plan.days.findIndex((d) => d.id === lastDone.dayId)
  if (lastIndex === -1) return trainable[0]

  for (let offset = 1; offset <= plan.days.length; offset++) {
    const day = plan.days[(lastIndex + offset) % plan.days.length]
    if (day.type !== 'rest' && day.blocks.length > 0) return day
  }
  return trainable[0]
}

export function findDay(plan: WorkoutPlan, dayId: string): PlanDay | undefined {
  return plan.days.find((d) => d.id === dayId)
}

export function completedCount(sessions: Session[], planId: string, dayId: string): number {
  return sessions.filter((s) => s.planId === planId && s.dayId === dayId && s.endedAt).length
}
