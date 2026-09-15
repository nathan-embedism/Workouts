/**
 * Guards the promise that updating the app never eats a training log.
 *
 * Runs the real persistence layer (src/lib/storage.ts) against data shaped the
 * way earlier releases wrote it. Run with `npm run test:data`.
 */
import { build } from 'vite'

const bundle = await build({
  logLevel: 'error',
  build: { write: false, lib: { entry: 'src/lib/storage.ts', formats: ['es'], fileName: 's' } },
})
const { migrate, DEFAULT_SETTINGS } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle[0].output[0].code).toString('base64')
)

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

/** Data as the first release wrote it, plus a field no released build knows. */
const legacy = {
  version: 1,
  settings: { units: 'lb', weightIncrement: 5, remindAfterDays: 3, lastExportAt: '2026-09-01T10:00:00.000Z' },
  plans: [{ id: 'plan_1', importedAt: '2026-08-01T09:00:00.000Z', plan: { schemaVersion: 1, planName: 'Legacy', units: 'lb', days: [] } }],
  activePlanId: 'plan_1',
  sessions: [{ id: 'sess_1', planId: 'plan_1', planName: 'Legacy', dayId: 'L1', dayName: 'Day', startedAt: '2026-08-10T09:00:00.000Z', endedAt: '2026-08-10T09:45:00.000Z', units: 'lb', stepIndex: 4, logs: [{ stepId: 's', exerciseName: 'Row', weight: 40, reps: 8, rpe: 8, units: 'lb', setIndex: 0, round: 0 }] }],
  builderDraft: { goal: 'old draft' },
  fieldFromTheFuture: { keepMe: true },
}

const { data, recovery } = migrate(structuredClone(legacy))
check('plans survive', data.plans.length === 1 && data.plans[0].plan.planName === 'Legacy')
check('sessions survive', data.sessions.length === 1 && data.sessions[0].logs[0].weight === 40)
check('active plan survives', data.activePlanId === 'plan_1')
check('builder draft survives', data.builderDraft.goal === 'old draft')
check('stored settings win over defaults', data.settings.units === 'lb' && data.settings.remindAfterDays === 3)
check('missing settings get defaults', data.settings.sound === DEFAULT_SETTINGS.sound)
check('unknown fields are preserved', JSON.stringify(data.fieldFromTheFuture) === '{"keepMe":true}')
check('clean load reports no problem', recovery === undefined)

// A future version's data opened by today's build: keep everything, warn loudly.
const future = migrate({ ...structuredClone(legacy), version: 99, somethingNew: [1, 2, 3] })
check('newer data is kept, not reset', future.data.plans.length === 1 && future.data.sessions.length === 1)
check('newer unknown fields kept', JSON.stringify(future.data.somethingNew) === '[1,2,3]')
check('newer data is reported', /newer version/i.test(future.recovery?.message ?? ''))

// Junk must not masquerade as a valid empty store.
for (const [name, value] of [['null', null], ['an array', [1, 2]], ['a string', 'nope']]) {
  const result = migrate(value)
  check(`${name} is reported, not silently accepted`, !!result.recovery && result.data.sessions.length === 0)
}

// Partial data should not throw away the parts that are there.
const partial = migrate({ version: 1, sessions: legacy.sessions })
check('missing plans key does not drop sessions', partial.data.sessions.length === 1 && partial.data.plans.length === 0)

console.log(failures ? `\n${failures} check(s) failed` : '\nall data-safety checks passed')
process.exit(failures ? 1 : 0)
