/**
 * Proves the short form of the plan format is worth asking an AI tool for: it
 * must expand to exactly the same plan as the written-out form, and be
 * substantially smaller. Run with `npm run test:format`.
 */
import { build } from 'vite'

const bundle = await build({
  logLevel: 'error',
  build: { write: false, lib: { entry: 'src/lib/validate.ts', formats: ['es'], fileName: 'v' } },
})
const { validatePlan } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle[0].output[0].code).toString('base64')
)

// Representative of what people actually ask for: 5 training days, 5 exercises
// each, 4 sets each, several exercises shared between days.
const LIB = {
  bench: { name: 'Barbell Bench Press', equipment: 'Flat bench + barbell', cues: 'Shoulder blades down and back, bar to lower chest.', machineSettings: ['bench position'] },
  incline: { name: 'Incline Dumbbell Press', equipment: 'Adjustable bench + dumbbells', machineSettings: ['bench angle'] },
  ohp: { name: 'Standing Overhead Press', equipment: 'Barbell', cues: 'Ribs down, squeeze glutes.' },
  pushdown: { name: 'Cable Triceps Pushdown', equipment: 'Cable machine', machineSettings: ['pulley height'] },
  lateral: { name: 'Dumbbell Lateral Raise', equipment: 'Dumbbells' },
  pulldown: { name: 'Lat Pulldown', equipment: 'Lat pulldown machine', machineSettings: ['knee pad height', 'grip width'] },
  row: { name: 'Chest Supported Row', equipment: 'Row machine', machineSettings: ['chest pad height'] },
  curl: { name: 'Incline Dumbbell Curl', equipment: 'Adjustable bench + dumbbells', machineSettings: ['bench angle'] },
  facepull: { name: 'Cable Face Pull', equipment: 'Cable machine', machineSettings: ['pulley height'] },
  squat: { name: 'Back Squat', equipment: 'Squat rack + barbell', cues: 'Brace, knees out, full depth.', machineSettings: ['rack pin height'] },
  rdl: { name: 'Romanian Deadlift', equipment: 'Barbell' },
  legpress: { name: 'Leg Press', equipment: 'Leg press machine', machineSettings: ['seat position', 'back angle'] },
  legcurl: { name: 'Seated Leg Curl', equipment: 'Leg curl machine', machineSettings: ['seat position', 'pad position'] },
  calf: { name: 'Standing Calf Raise', equipment: 'Calf raise machine', machineSettings: ['shoulder pad height'] },
}
const DAYS = [
  { name: 'Upper Push', weekday: 'Monday', focus: ['chest', 'shoulders', 'triceps'], use: ['bench', 'incline', 'ohp', 'lateral', 'pushdown'] },
  { name: 'Lower', weekday: 'Tuesday', focus: ['legs', 'glutes'], use: ['squat', 'rdl', 'legpress', 'legcurl', 'calf'] },
  { name: 'Upper Pull', weekday: 'Thursday', focus: ['back', 'biceps'], use: ['pulldown', 'row', 'facepull', 'curl', 'lateral'] },
  { name: 'Lower B', weekday: 'Friday', focus: ['legs'], use: ['rdl', 'squat', 'legcurl', 'legpress', 'calf'] },
  { name: 'Upper Mix', weekday: 'Saturday', focus: ['chest', 'back'], use: ['incline', 'row', 'pushdown', 'curl', 'facepull'] },
]
const meta = { schemaVersion: 1, planName: '8-week upper/lower', goal: 'Build muscle', units: 'kg', durationWeeks: 8, daysPerWeek: 5 }
const load = (i, j) => 20 + i * 10 + j * 5

const longForm = {
  ...meta,
  days: DAYS.map((day, i) => ({
    id: `d${i + 1}`, dayNumber: i + 1, name: day.name, weekday: day.weekday,
    type: 'strength', focus: day.focus, estimatedMinutes: 60,
    blocks: day.use.map((key, j) => ({
      id: `d${i + 1}b${j + 1}`, kind: 'single', restAfterBlockSeconds: 90,
      exercises: [{
        id: `d${i + 1}b${j + 1}e1`, ...LIB[key], modality: 'weights', trackingFields: ['weight', 'reps'],
        sets: [
          { type: 'warmup', reps: 10, targetWeight: load(i, j) / 2, restSeconds: 60 },
          ...[0, 1, 2].map(() => ({ type: 'working', repRange: [8, 12], targetWeight: load(i, j), rpeTarget: 8, restSeconds: 90 })),
        ],
      }],
    })),
  })),
}

const shortForm = {
  ...meta,
  defaults: { restSeconds: 90, restAfterBlockSeconds: 90, modality: 'weights', setType: 'working', trackingFields: ['weight', 'reps'] },
  exercises: LIB,
  days: DAYS.map((day, i) => ({
    dayNumber: i + 1, name: day.name, weekday: day.weekday, type: 'strength',
    focus: day.focus, estimatedMinutes: 60,
    blocks: day.use.map((key, j) => ({
      kind: 'single',
      exercises: [{
        ref: key,
        sets: [
          { type: 'warmup', reps: 10, targetWeight: load(i, j) / 2, restSeconds: 60 },
          { repRange: [8, 12], targetWeight: load(i, j), rpeTarget: 8, repeat: 3 },
        ],
      }],
    })),
  })),
}

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const long = validatePlan(longForm)
const short = validatePlan(shortForm)
check('written-out form validates', long.ok, long.errors.join('; '))
check('short form validates', short.ok, short.errors.join('; '))
check('short form needs no guesses', short.warnings.length === 0, short.warnings.join('; '))

if (long.ok && short.ok) {
  // Ids are generated, so compare everything that describes the training.
  const shape = (plan) => JSON.stringify(plan.days.map((d) => ({
    n: d.name, w: d.weekday, t: d.type, f: d.focus,
    blocks: d.blocks.map((b) => ({
      k: b.kind, rounds: b.rounds, rest: b.restAfterBlockSeconds,
      ex: b.exercises.map((e) => ({
        name: e.name, equipment: e.equipment, cues: e.cues,
        settings: e.machineSettings, modality: e.modality, tracking: e.trackingFields, sets: e.sets,
      })),
    })),
  })))
  check('both forms expand to the same plan', shape(long.plan) === shape(short.plan))

  const sets = (plan) => plan.days.reduce((t, d) => t + d.blocks.reduce((u, b) => u + b.exercises.reduce((v, e) => v + e.sets.length, 0), 0), 0)
  check('every set is present', sets(short.plan) === 100, `${sets(short.plan)} sets`)

  const longSize = JSON.stringify(longForm).length
  const shortSize = JSON.stringify(shortForm).length
  const saved = Math.round((1 - shortSize / longSize) * 100)
  check(`short form is at least 40% smaller (${saved}%)`, saved >= 40,
    `${longSize} → ${shortSize} chars`)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall plan-format checks passed')
process.exit(failures ? 1 : 0)
