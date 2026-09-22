import type { Block, Exercise, PlanDay, TrackingField, WorkoutSet } from '../types'

/** One thing the runner puts on screen: either a set to perform or a rest timer. */
export type Step = SetStep | RestStep

export interface SetStep {
  id: string
  kind: 'set'
  blockId: string
  blockKind: Block['kind']
  blockName?: string
  blockNotes?: string
  exercise: Exercise
  set: WorkoutSet
  /** Index of this set within its exercise. */
  setIndex: number
  setsInExercise: number
  /** Superset/circuit round, 0-based. */
  round: number
  totalRounds: number
  /** Position of the exercise inside its block, for "2 of 3" in a superset. */
  exerciseIndex: number
  exercisesInBlock: number
  /** The exercise the plan asked for, when this one was swapped in mid-workout. */
  swappedFrom?: string
}

export interface RestStep {
  id: string
  kind: 'rest'
  seconds: number
  /** "Rest" vs "Change station" reads differently mid-superset. */
  label: string
  blockId: string
}

const DEFAULT_TRACKING: Record<Exercise['modality'], TrackingField[]> = {
  weights: ['weight', 'reps'],
  bodyweight: ['reps'],
  cardio: ['duration', 'level'],
  mobility: ['duration'],
}

/** What the logging controls should ask for, if the plan did not say. */
export function trackingFieldsFor(exercise: Exercise, set: WorkoutSet): TrackingField[] {
  if (exercise.trackingFields?.length) return exercise.trackingFields

  const fields = new Set<TrackingField>(DEFAULT_TRACKING[exercise.modality])
  if (set.targetIncline !== undefined) fields.add('incline')
  if (set.targetLevel !== undefined) fields.add('level')
  if (set.targetSpeed !== undefined) fields.add('speed')
  if (set.targetDistance !== undefined) fields.add('distance')
  if (set.durationSeconds !== undefined) fields.add('duration')
  if (set.targetWeight !== undefined || set.targetWeightPercent !== undefined) fields.add('weight')
  if (set.reps !== undefined || set.repRange !== undefined) fields.add('reps')
  return [...fields]
}

function restAfter(set: WorkoutSet, fallback?: number): number {
  return set.restSeconds ?? fallback ?? 0
}

/**
 * Expand a day into the flat sequence the runner walks through. Straight sets run
 * in order; supersets and circuits interleave their exercises round by round.
 */
export function buildSteps(day: PlanDay): Step[] {
  const steps: Step[] = []

  day.blocks.forEach((block) => {
    if (block.kind === 'single') {
      const exercise = block.exercises[0]
      if (!exercise) return
      exercise.sets.forEach((set, setIndex) => {
        steps.push({
          id: `${block.id}:${exercise.id}:${setIndex}`,
          kind: 'set',
          blockId: block.id,
          blockKind: block.kind,
          blockName: block.name,
          blockNotes: block.notes,
          exercise,
          set,
          setIndex,
          setsInExercise: exercise.sets.length,
          round: 0,
          totalRounds: 1,
          exerciseIndex: 0,
          exercisesInBlock: 1,
        })
        const seconds = restAfter(set, block.restAfterBlockSeconds)
        if (seconds > 0) {
          steps.push({
            id: `${block.id}:${exercise.id}:${setIndex}:rest`,
            kind: 'rest',
            seconds,
            label: 'Rest',
            blockId: block.id,
          })
        }
      })
      return
    }

    // Superset / circuit: one set from each exercise, then round again.
    const rounds = block.rounds ?? Math.max(...block.exercises.map((e) => e.sets.length))
    for (let round = 0; round < rounds; round++) {
      block.exercises.forEach((exercise, exerciseIndex) => {
        const set = exercise.sets[Math.min(round, exercise.sets.length - 1)]
        if (!set) return
        steps.push({
          id: `${block.id}:${exercise.id}:r${round}`,
          kind: 'set',
          blockId: block.id,
          blockKind: block.kind,
          blockName: block.name,
          blockNotes: block.notes,
          exercise,
          set,
          setIndex: Math.min(round, exercise.sets.length - 1),
          setsInExercise: exercise.sets.length,
          round,
          totalRounds: rounds,
          exerciseIndex,
          exercisesInBlock: block.exercises.length,
        })

        const isLastOfRound = exerciseIndex === block.exercises.length - 1
        const seconds = isLastOfRound
          ? restAfter(set, block.restAfterBlockSeconds)
          : block.restBetweenExercisesSeconds ?? 0
        if (seconds > 0) {
          steps.push({
            id: `${block.id}:${exercise.id}:r${round}:rest`,
            kind: 'rest',
            seconds,
            label: isLastOfRound ? 'Rest' : 'Change station',
            blockId: block.id,
          })
        }
      })
    }
  })

  // A trailing rest after the final set is just standing around.
  while (steps.length && steps[steps.length - 1].kind === 'rest') steps.pop()

  return steps
}

export function countSets(day: PlanDay): number {
  return buildSteps(day).filter((s) => s.kind === 'set').length
}

export function estimateMinutes(day: PlanDay): number {
  if (day.estimatedMinutes) return day.estimatedMinutes
  const steps = buildSteps(day)
  const seconds = steps.reduce((total, step) => {
    if (step.kind === 'rest') return total + step.seconds
    return total + (step.set.durationSeconds ?? 45)
  }, 0)
  return Math.max(1, Math.round(seconds / 60))
}

/**
 * Substitute exercises the user swapped out mid-workout, keyed by the plan's
 * exercise id. Sets, reps and rest carry over; the equipment, the cues and the
 * target load do not, because those described the movement that was replaced —
 * and 100 kg on the leg press is not 100 kg on anything else.
 */
export function withSwaps(steps: Step[], swaps: Record<string, string>): Step[] {
  if (!swaps || !Object.keys(swaps).length) return steps
  return steps.map((step) => {
    if (step.kind !== 'set') return step
    const name = swaps[step.exercise.id]
    if (!name || name === step.exercise.name) return step
    return {
      ...step,
      exercise: {
        ...step.exercise,
        name,
        equipment: undefined,
        cues: undefined,
        machineSettings: undefined,
      },
      set: { ...step.set, targetWeight: undefined, targetWeightPercent: undefined },
      swappedFrom: step.exercise.name,
    }
  })
}

/**
 * Move sets the user put off to the end of the workout, in the order they were
 * put off. A set takes the rest that followed it along with it.
 */
export function withDeferred(steps: Step[], deferred: string[]): Step[] {
  if (!deferred?.length) return steps

  const wanted = new Set(deferred)
  const moved = new Map<string, Step[]>()
  const kept: Step[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step.kind === 'set' && wanted.has(step.id)) {
      const group: Step[] = [step]
      if (steps[i + 1]?.kind === 'rest') group.push(steps[++i])
      moved.set(step.id, group)
      continue
    }
    kept.push(step)
  }

  const reordered = [...kept, ...deferred.flatMap((id) => moved.get(id) ?? [])]
  // Whatever ends up last, nobody needs a rest timer after it.
  while (reordered.length && reordered[reordered.length - 1].kind === 'rest') reordered.pop()
  return reordered
}

export function nextSetStep(steps: Step[], from: number): SetStep | undefined {
  for (let i = from; i < steps.length; i++) {
    const step = steps[i]
    if (step.kind === 'set') return step
  }
  return undefined
}
