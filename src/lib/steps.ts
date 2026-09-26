import type { Block, Exercise, PlanDay, TrackingField, WorkoutSet } from '../types'

/** One thing the runner puts on screen: a set, a timed AMRAP, or a rest timer. */
export type Step = SetStep | AmrapStep | RestStep

/** Anything the user performs, as opposed to rests. */
export type WorkStep = SetStep | AmrapStep

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
}

/**
 * A time-capped AMRAP: the block's exercises alternated against one clock,
 * with the user tapping to switch so each stint is timed. Logged as one
 * entry per stint.
 */
export interface AmrapStep {
  id: string
  kind: 'amrap'
  blockId: string
  blockKind: Block['kind']
  blockName?: string
  blockNotes?: string
  exercises: Exercise[]
  seconds: number
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

/**
 * The time cap if this block is an AMRAP against the clock. Plans written
 * before `timeCapSeconds` existed often said it as a circuit whose every set is
 * an AMRAP with a duration, so that reads as one too.
 */
export function amrapCapFor(block: Block): number | undefined {
  if (block.kind === 'single' || block.exercises.length < 2) return undefined
  if (block.timeCapSeconds) return block.timeCapSeconds
  if (block.rounds && block.rounds > 1) return undefined
  const sets = block.exercises.flatMap((e) => e.sets)
  if (!sets.length || !sets.every((s) => s.type === 'amrap')) return undefined
  const durations = sets.map((s) => s.durationSeconds).filter((d): d is number => !!d)
  return durations.length === sets.length ? Math.max(...durations) : undefined
}

/** Reps are worth asking for: the exercise is logged by count, not by time. */
export function isCountable(exercise: Exercise): boolean {
  const set = exercise.sets[0] ?? { type: 'amrap' }
  return trackingFieldsFor(exercise, set).includes('reps')
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

    const cap = amrapCapFor(block)
    if (cap) {
      steps.push({
        id: `${block.id}:amrap`,
        kind: 'amrap',
        blockId: block.id,
        blockKind: block.kind,
        blockName: block.name,
        blockNotes: block.notes,
        exercises: block.exercises,
        seconds: cap,
      })
      const seconds = block.restAfterBlockSeconds ?? 0
      if (seconds > 0) {
        steps.push({ id: `${block.id}:amrap:rest`, kind: 'rest', seconds, label: 'Rest', blockId: block.id })
      }
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
  return buildSteps(day).filter((s) => s.kind !== 'rest').length
}

export function estimateMinutes(day: PlanDay): number {
  if (day.estimatedMinutes) return day.estimatedMinutes
  const steps = buildSteps(day)
  const seconds = steps.reduce((total, step) => {
    if (step.kind === 'rest' || step.kind === 'amrap') return total + step.seconds
    return total + (step.set.durationSeconds ?? 45)
  }, 0)
  return Math.max(1, Math.round(seconds / 60))
}

export function nextWorkStep(steps: Step[], from: number): WorkStep | undefined {
  for (let i = from; i < steps.length; i++) {
    const step = steps[i]
    if (step.kind !== 'rest') return step
  }
  return undefined
}
