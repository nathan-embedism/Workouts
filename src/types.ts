/**
 * The plan format. This is the contract between the user's AI tool and this app:
 * `src/lib/schema.ts` describes it in prose for the prompt, `src/lib/validate.ts`
 * checks and normalises whatever comes back.
 */

export type Units = 'kg' | 'lb'

export type Modality = 'weights' | 'cardio' | 'bodyweight' | 'mobility'

export type TrackingField =
  | 'weight'
  | 'reps'
  | 'incline'
  | 'level'
  | 'speed'
  | 'distance'
  | 'duration'

export type SetType =
  | 'warmup'
  | 'working'
  | 'amrap'
  | 'timed'
  | 'distance'
  | 'failure'

export type DayType = 'strength' | 'cardio' | 'mixed' | 'mobility' | 'rest'

export type BlockKind = 'single' | 'superset' | 'circuit'

export interface DistanceTarget {
  value: number
  unit: 'm' | 'km' | 'mi' | 'cal' | 'floors'
}

export interface DropSet {
  /** Reps to aim for at this drop, if prescribed. */
  reps?: number
  /** Absolute load for the drop, in plan units. */
  weight?: number
  /** Or the load as a percentage of the set's working weight. */
  weightPercent?: number
  toFailure?: boolean
}

export interface WorkoutSet {
  type: SetType
  /**
   * Input only: "do this set N times". Expanded into N sets at import, so
   * nothing downstream ever sees it. Lets a plan say one thing instead of four.
   */
  repeat?: number
  reps?: number
  /** Inclusive [min, max] when the plan prescribes a range rather than a number. */
  repRange?: [number, number]
  targetWeight?: number
  /** Percentage of 1RM, when the plan works in percentages. */
  targetWeightPercent?: number
  targetIncline?: number
  targetLevel?: number
  targetSpeed?: number
  targetDistance?: DistanceTarget
  durationSeconds?: number
  tempo?: string
  rpeTarget?: number
  restSeconds?: number
  drops?: DropSet[]
  notes?: string
}

export interface Exercise {
  id: string
  /** Input only: pull the rest of this exercise from the plan's `exercises` library. */
  ref?: string
  name: string
  modality: Modality
  equipment?: string
  /** Machine settings worth recording, e.g. ["seat height", "pad position"]. */
  machineSettings?: string[]
  cues?: string
  /** What the runner asks the user to log. Defaults are derived from modality. */
  trackingFields?: TrackingField[]
  sets: WorkoutSet[]
}

export interface Block {
  id: string
  kind: BlockKind
  name?: string
  /** Superset/circuit only: how many times round the exercises. */
  rounds?: number
  restBetweenExercisesSeconds?: number
  restAfterBlockSeconds?: number
  notes?: string
  exercises: Exercise[]
}

export interface PlanDay {
  id: string
  dayNumber: number
  name: string
  weekday?: string
  type: DayType
  focus?: string[]
  estimatedMinutes?: number
  notes?: string
  blocks: Block[]
}

export interface PlanEvent {
  name: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  notes?: string
}

/** Input only: values every set or exercise inherits unless it says otherwise. */
export interface PlanDefaults {
  restSeconds?: number
  restAfterBlockSeconds?: number
  modality?: Modality
  setType?: SetType
  tempo?: string
  trackingFields?: TrackingField[]
}

export interface WorkoutPlan {
  schemaVersion: 1
  planName: string
  goal?: string
  units: Units
  /** Input only: inherited by anything that omits the field. */
  defaults?: PlanDefaults
  /**
   * Input only: reusable exercise definitions keyed by a short id, so an
   * exercise used on four days is described once and referenced by `ref`.
   */
  exercises?: Record<string, Partial<Exercise>>
  durationWeeks?: number
  daysPerWeek?: number
  notes?: string
  events?: PlanEvent[]
  days: PlanDay[]
}

/* ---------------------------------------------------------------- logging */

export interface SetLog {
  sessionId: string
  stepId: string
  exerciseId: string
  exerciseName: string
  blockId: string
  setIndex: number
  round: number
  setType: SetType
  weight?: number
  reps?: number
  incline?: number
  level?: number
  speed?: number
  distance?: number
  distanceUnit?: string
  durationSeconds?: number
  rpe?: number
  units: Units
  skipped?: boolean
  notes?: string
  at: string
}

export interface Session {
  id: string
  planId: string
  planName: string
  dayId: string
  dayName: string
  startedAt: string
  endedAt?: string
  units: Units
  logs: SetLog[]
  /** Where the runner left off, so a closed tab can pick the session back up. */
  stepIndex: number
  /** Sets put off to the end of this workout, in the order they were put off. */
  deferredStepIds?: string[]
  /** Exercises swapped mid-workout: the plan's exercise id → what was done instead. */
  swaps?: Record<string, string>
  notes?: string
}

export interface StoredPlan {
  id: string
  importedAt: string
  plan: WorkoutPlan
}

export interface Settings {
  units: Units
  weightIncrement: number
  autoStartRest: boolean
  sound: boolean
  vibrate: boolean
  keepAwake: boolean
  /** Nag thresholds for backing data up. */
  remindAfterSessions: number
  remindAfterDays: number
  lastExportAt?: string
  lastExportSessionCount?: number
}

export interface AppData {
  version: 1
  settings: Settings
  plans: StoredPlan[]
  activePlanId?: string
  sessions: Session[]
  /** Saved answers from the prompt builder, so the form survives a reload. */
  builderDraft?: Record<string, unknown>
}
