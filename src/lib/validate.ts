import type {
  Block, BlockKind, DayType, DistanceTarget, DropSet, Exercise, Modality,
  PlanDay, PlanEvent, SetType, TrackingField, Units, WorkoutPlan, WorkoutSet,
} from '../types'

export interface ValidationResult {
  ok: boolean
  plan?: WorkoutPlan
  errors: string[]
  warnings: string[]
}

const SET_TYPES: SetType[] = ['warmup', 'working', 'amrap', 'timed', 'distance', 'failure']
const MODALITIES: Modality[] = ['weights', 'cardio', 'bodyweight', 'mobility']
const DAY_TYPES: DayType[] = ['strength', 'cardio', 'mixed', 'mobility', 'rest']
const BLOCK_KINDS: BlockKind[] = ['single', 'superset', 'circuit']
const TRACKING: TrackingField[] = ['weight', 'reps', 'incline', 'level', 'speed', 'distance', 'duration']
const DISTANCE_UNITS = ['m', 'km', 'mi', 'cal', 'floors']

/** Pull a JSON object out of whatever the AI tool produced. */
export function extractJson(raw: string): { text: string; trimmed: boolean } {
  let text = raw.trim()
  let trimmed = false

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) {
    text = fence[1].trim()
    trimmed = true
  }

  if (!text.startsWith('{')) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1)
      trimmed = true
    }
  }
  return { text, trimmed }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return undefined
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.map(str).filter((s): s is string => !!s)
  return out.length ? out : undefined
}

export function validatePlan(input: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isObj(input)) {
    return { ok: false, errors: ['The top level of the file must be a JSON object starting with {.'], warnings }
  }

  const version = num(input.schemaVersion)
  if (version === undefined) {
    warnings.push('No "schemaVersion" — assuming 1.')
  } else if (version !== 1) {
    warnings.push(`"schemaVersion" is ${version}; this app understands version 1. Importing anyway.`)
  }

  const planName = str(input.planName) ?? str(input.name)
  if (!planName) errors.push('Missing "planName" (a short name for the plan).')

  let units = str(input.units)?.toLowerCase() as Units | undefined
  if (units !== 'kg' && units !== 'lb') {
    if (units) warnings.push(`"units" was "${units}" — expected "kg" or "lb". Using kg.`)
    else warnings.push('No "units" given — using kg.')
    units = 'kg'
  }

  const rawDays = input.days
  if (!Array.isArray(rawDays)) {
    errors.push('Missing "days" — it must be an array of workout days.')
  } else if (rawDays.length === 0) {
    errors.push('"days" is empty — the plan needs at least one day.')
  }

  const days: PlanDay[] = []
  const seenDayIds = new Set<string>()

  if (Array.isArray(rawDays)) {
    rawDays.forEach((rawDay, di) => {
      const where = `days[${di}]`
      if (!isObj(rawDay)) {
        errors.push(`${where} is not an object.`)
        return
      }

      const name = str(rawDay.name) ?? str(rawDay.title)
      if (!name) errors.push(`${where} is missing "name".`)

      let id = str(rawDay.id) ?? `d${di + 1}`
      if (seenDayIds.has(id)) {
        warnings.push(`${where} reuses id "${id}" — renamed to keep days distinct.`)
        id = `${id}-${di + 1}`
      }
      seenDayIds.add(id)

      let type = str(rawDay.type)?.toLowerCase() as DayType | undefined
      if (!type || !DAY_TYPES.includes(type)) {
        if (type) warnings.push(`${where}.type was "${type}" — expected one of ${DAY_TYPES.join(', ')}. Using "mixed".`)
        type = 'mixed'
      }

      const blocks: Block[] = []
      const rawBlocks = rawDay.blocks
      if (!Array.isArray(rawBlocks)) {
        if (type !== 'rest') errors.push(`${where}.blocks is missing — it must be an array (use [] for a rest day).`)
      } else {
        rawBlocks.forEach((rawBlock, bi) => {
          const bWhere = `${where}.blocks[${bi}]`
          if (!isObj(rawBlock)) {
            errors.push(`${bWhere} is not an object.`)
            return
          }

          let kind = str(rawBlock.kind)?.toLowerCase() as BlockKind | undefined
          if (!kind || !BLOCK_KINDS.includes(kind)) {
            const exCount = Array.isArray(rawBlock.exercises) ? rawBlock.exercises.length : 0
            kind = exCount > 1 ? 'superset' : 'single'
            if (str(rawBlock.kind)) {
              warnings.push(`${bWhere}.kind was "${str(rawBlock.kind)}" — treating it as "${kind}".`)
            }
          }

          const rawExercises = rawBlock.exercises
          if (!Array.isArray(rawExercises) || rawExercises.length === 0) {
            errors.push(`${bWhere}.exercises is missing or empty.`)
            return
          }

          const exercises: Exercise[] = []
          rawExercises.forEach((rawEx, ei) => {
            const eWhere = `${bWhere}.exercises[${ei}]`
            if (!isObj(rawEx)) {
              errors.push(`${eWhere} is not an object.`)
              return
            }
            const exName = str(rawEx.name)
            if (!exName) {
              errors.push(`${eWhere} is missing "name".`)
              return
            }

            let modality = str(rawEx.modality)?.toLowerCase() as Modality | undefined
            if (!modality || !MODALITIES.includes(modality)) {
              modality = type === 'cardio' ? 'cardio' : 'weights'
            }

            const rawSets = rawEx.sets
            const sets: WorkoutSet[] = []
            if (!Array.isArray(rawSets) || rawSets.length === 0) {
              errors.push(`${eWhere} ("${exName}") has no "sets".`)
            } else {
              rawSets.forEach((rawSet, si) => {
                const sWhere = `${eWhere}.sets[${si}]`
                if (!isObj(rawSet)) {
                  errors.push(`${sWhere} is not an object.`)
                  return
                }
                let setType = str(rawSet.type)?.toLowerCase() as SetType | undefined
                if (!setType || !SET_TYPES.includes(setType)) {
                  if (str(rawSet.type)) {
                    warnings.push(`${sWhere}.type was "${str(rawSet.type)}" — treating it as "working".`)
                  }
                  setType = 'working'
                }

                const set: WorkoutSet = { type: setType }

                const reps = num(rawSet.reps)
                if (reps !== undefined) set.reps = reps

                const range = rawSet.repRange
                if (Array.isArray(range) && range.length === 2) {
                  const lo = num(range[0])
                  const hi = num(range[1])
                  if (lo !== undefined && hi !== undefined) set.repRange = [lo, hi]
                }

                const target = set as unknown as Record<string, number>
                const assignNum = (key: keyof WorkoutSet, value: unknown) => {
                  const n = num(value)
                  if (n !== undefined) target[key] = n
                }
                assignNum('targetWeight', rawSet.targetWeight)
                assignNum('targetWeightPercent', rawSet.targetWeightPercent)
                assignNum('targetIncline', rawSet.targetIncline)
                assignNum('targetLevel', rawSet.targetLevel)
                assignNum('targetSpeed', rawSet.targetSpeed)
                assignNum('durationSeconds', rawSet.durationSeconds)
                assignNum('rpeTarget', rawSet.rpeTarget)
                assignNum('restSeconds', rawSet.restSeconds)

                if (isObj(rawSet.targetDistance)) {
                  const value = num(rawSet.targetDistance.value)
                  const unit = str(rawSet.targetDistance.unit)
                  if (value !== undefined && unit && DISTANCE_UNITS.includes(unit)) {
                    set.targetDistance = { value, unit } as DistanceTarget
                  } else if (value !== undefined) {
                    set.targetDistance = { value, unit: 'm' }
                    warnings.push(`${sWhere}.targetDistance.unit was "${unit ?? 'missing'}" — using metres.`)
                  }
                }

                const tempo = str(rawSet.tempo)
                if (tempo) set.tempo = tempo
                const setNotes = str(rawSet.notes)
                if (setNotes) set.notes = setNotes

                if (Array.isArray(rawSet.drops) && rawSet.drops.length) {
                  const drops: DropSet[] = []
                  rawSet.drops.forEach((rawDrop: unknown) => {
                    if (!isObj(rawDrop)) return
                    const drop: DropSet = {}
                    const dReps = num(rawDrop.reps)
                    if (dReps !== undefined) drop.reps = dReps
                    const dWeight = num(rawDrop.weight)
                    if (dWeight !== undefined) drop.weight = dWeight
                    const dPct = num(rawDrop.weightPercent)
                    if (dPct !== undefined) drop.weightPercent = dPct
                    if (rawDrop.toFailure === true) drop.toFailure = true
                    drops.push(drop)
                  })
                  if (drops.length) set.drops = drops
                }

                sets.push(set)
              })
            }

            const tracking = strArray(rawEx.trackingFields)
              ?.map((f) => f.toLowerCase())
              .filter((f): f is TrackingField => TRACKING.includes(f as TrackingField))

            const exercise: Exercise = {
              id: str(rawEx.id) ?? `${id}-b${bi + 1}-e${ei + 1}`,
              name: exName,
              modality,
              sets,
            }
            const equipment = str(rawEx.equipment)
            if (equipment) exercise.equipment = equipment
            const machineSettings = strArray(rawEx.machineSettings)
            if (machineSettings) exercise.machineSettings = machineSettings
            const cues = str(rawEx.cues)
            if (cues) exercise.cues = cues
            if (tracking?.length) exercise.trackingFields = tracking

            exercises.push(exercise)
          })

          if (!exercises.length) return

          if (kind !== 'single' && exercises.length === 1) {
            warnings.push(`${bWhere} is a "${kind}" with one exercise — running it as a straight set.`)
            kind = 'single'
          }
          if (kind === 'single' && exercises.length > 1) {
            warnings.push(`${bWhere} is a "single" block with ${exercises.length} exercises — running it as a superset.`)
            kind = 'superset'
          }

          const block: Block = {
            id: str(rawBlock.id) ?? `${id}-b${bi + 1}`,
            kind,
            exercises,
          }
          const blockName = str(rawBlock.name)
          if (blockName) block.name = blockName
          const rounds = num(rawBlock.rounds)
          if (rounds !== undefined) block.rounds = rounds
          const restBetween = num(rawBlock.restBetweenExercisesSeconds)
          if (restBetween !== undefined) block.restBetweenExercisesSeconds = restBetween
          const restAfter = num(rawBlock.restAfterBlockSeconds)
          if (restAfter !== undefined) block.restAfterBlockSeconds = restAfter
          const blockNotes = str(rawBlock.notes)
          if (blockNotes) block.notes = blockNotes

          blocks.push(block)
        })
      }

      if (type !== 'rest' && blocks.length === 0 && Array.isArray(rawBlocks) && rawBlocks.length === 0) {
        warnings.push(`${where} ("${name ?? id}") has no exercises — treating it as a rest day.`)
        type = 'rest'
      }

      const day: PlanDay = {
        id,
        dayNumber: num(rawDay.dayNumber) ?? di + 1,
        name: name ?? `Day ${di + 1}`,
        type,
        blocks,
      }
      const weekday = str(rawDay.weekday)
      if (weekday) day.weekday = weekday
      const focus = strArray(rawDay.focus)
      if (focus) day.focus = focus
      const estimated = num(rawDay.estimatedMinutes)
      if (estimated !== undefined) day.estimatedMinutes = estimated
      const dayNotes = str(rawDay.notes)
      if (dayNotes) day.notes = dayNotes

      days.push(day)
    })
  }

  const events: PlanEvent[] = []
  if (Array.isArray(input.events)) {
    input.events.forEach((rawEvent: unknown, i: number) => {
      if (!isObj(rawEvent)) return
      const name = str(rawEvent.name)
      const date = str(rawEvent.date)
      if (!name || !date) {
        warnings.push(`events[${i}] needs both "name" and "date" — skipped.`)
        return
      }
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
        warnings.push(`events[${i}].date "${date}" is not YYYY-MM-DD — skipped.`)
        return
      }
      const event: PlanEvent = { name, date: date.slice(0, 10) }
      const eventNotes = str(rawEvent.notes)
      if (eventNotes) event.notes = eventNotes
      events.push(event)
    })
  }

  if (errors.length) return { ok: false, errors, warnings }

  const plan: WorkoutPlan = {
    schemaVersion: 1,
    planName: planName!,
    units: units!,
    days,
  }
  const goal = str(input.goal)
  if (goal) plan.goal = goal
  const durationWeeks = num(input.durationWeeks)
  if (durationWeeks !== undefined) plan.durationWeeks = durationWeeks
  const daysPerWeek = num(input.daysPerWeek)
  if (daysPerWeek !== undefined) plan.daysPerWeek = daysPerWeek
  const notes = str(input.notes)
  if (notes) plan.notes = notes
  if (events.length) plan.events = events

  return { ok: true, plan, errors, warnings }
}

export function parseAndValidate(raw: string): ValidationResult {
  if (!raw.trim()) {
    return { ok: false, errors: ['Nothing pasted yet.'], warnings: [] }
  }
  const { text, trimmed } = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const position = /position (\d+)/.exec(message)
    let detail = ''
    if (position) {
      const idx = Number(position[1])
      const upTo = text.slice(0, idx)
      const lineNo = upTo.split('\n').length
      const col = idx - upTo.lastIndexOf('\n')
      const snippet = text.slice(Math.max(0, idx - 40), idx + 40).replace(/\n/g, ' ')
      detail = ` (line ${lineNo}, column ${col}) near: …${snippet}…`
    }
    return {
      ok: false,
      errors: [
        `That is not valid JSON: ${message}${detail}`,
        'Ask your AI tool to return the whole plan again as one JSON object, with no prose around it.',
      ],
      warnings: [],
    }
  }
  const result = validatePlan(parsed)
  if (trimmed) result.warnings.unshift('Extra text around the JSON was ignored.')
  return result
}
