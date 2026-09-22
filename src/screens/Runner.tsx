import { useMemo, useState } from 'react'
import type { Navigate } from '../App'
import type { PlanDay, Session, SetLog, WorkoutPlan } from '../types'
import { useStore } from '../lib/store'
import { findDay } from '../lib/plan'
import {
  buildSteps, nextSetStep, withDeferred, withSwaps, type SetStep, type Step,
} from '../lib/steps'
import { lastTimeFor, normaliseName, type LastTime } from '../lib/history'
import { clockTime, durationWords, repsTarget, setTargetLine } from '../lib/format'
import { useElapsed, useWakeLock, vibrate } from '../lib/hooks'
import FullscreenTimer from '../components/FullscreenTimer'
import SetLogger, { type LoggedValues } from '../components/SetLogger'
import SessionSummary from './SessionSummary'
import { Banner, useFlash } from '../components/ui'

export default function Runner({ session, navigate }: { session: Session; navigate: Navigate }) {
  const store = useStore()
  const { plans, settings, logSet, setStepIndex, deferStep, swapExercise } = store
  const flash = useFlash()
  const [workTimer, setWorkTimer] = useState(false)
  const [exitSheet, setExitSheet] = useState(false)
  const [swapSheet, setSwapSheet] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, LoggedValues>>({})
  const elapsed = useElapsed(session.startedAt)
  useWakeLock(settings.keepAwake)

  const plan = plans.find((p) => p.id === session.planId)?.plan
  const day = plan ? findDay(plan, session.dayId) : undefined
  // The plan's order, then what this workout did to it: swaps first, so a
  // deferred set keeps whatever it was swapped for.
  const steps = useMemo(() => (day
    ? withDeferred(withSwaps(buildSteps(day), session.swaps ?? {}), session.deferredStepIds ?? [])
    : []), [day, session.swaps, session.deferredStepIds])

  const index = Math.min(session.stepIndex, steps.length)
  const step: Step | undefined = steps[index]
  const setSteps = steps.filter((s): s is SetStep => s.kind === 'set')
  const setNumber = steps.slice(0, index).filter((s) => s.kind === 'set').length

  const lastTime: LastTime | undefined = useMemo(() => {
    if (!step || step.kind !== 'set') return undefined
    return lastTimeFor(store.sessions, step.exercise.name, settings.units, session.id)
  }, [step, store.sessions, settings.units, session.id])

  if (!plan || !day) {
    return (
      <main className="page">
        <Banner tone="error">The plan this workout came from is no longer saved.</Banner>
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/')}>Back to today</button>
      </main>
    )
  }

  const done = index >= steps.length || finishing

  if (done) {
    return (
      <SessionSummary
        session={session}
        onResume={finishing ? () => setFinishing(false) : undefined}
        navigate={navigate}
      />
    )
  }

  const goTo = (next: number) => {
    setWorkTimer(false)
    setStepIndex(session.id, Math.max(0, Math.min(steps.length, next)))
    window.scrollTo({ top: 0 })
  }

  const previousSetIndex = () => {
    for (let i = index - 1; i >= 0; i--) if (steps[i].kind === 'set') return i
    return 0
  }

  const values = (setStep: SetStep): LoggedValues =>
    drafts[setStep.id] ?? initialValues(setStep, session, lastTime)

  const writeLog = (setStep: SetStep, entry: LoggedValues, skipped: boolean) => {
    const log: SetLog = {
      sessionId: session.id,
      stepId: setStep.id,
      exerciseId: setStep.exercise.id,
      exerciseName: setStep.exercise.name,
      blockId: setStep.blockId,
      setIndex: setStep.setIndex,
      round: setStep.round,
      setType: setStep.set.type,
      units: settings.units,
      at: new Date().toISOString(),
      ...(skipped ? { skipped: true } : {}),
    }
    if (!skipped) {
      if (entry.weight !== undefined) log.weight = entry.weight
      if (entry.reps !== undefined) log.reps = entry.reps
      if (entry.incline !== undefined) log.incline = entry.incline
      if (entry.level !== undefined) log.level = entry.level
      if (entry.speed !== undefined) log.speed = entry.speed
      if (entry.distance !== undefined) {
        log.distance = entry.distance
        log.distanceUnit = setStep.set.targetDistance?.unit ?? 'm'
      }
      if (entry.durationSeconds !== undefined) log.durationSeconds = entry.durationSeconds
      if (entry.rpe !== undefined) log.rpe = entry.rpe
      if (entry.notes?.trim()) log.notes = entry.notes.trim()
    }
    logSet(log)
    if (settings.vibrate) vibrate(40)
    goTo(index + 1)
  }

  /**
   * Put this set off to the end. It leaves its place in the list, so the index
   * already points at whatever comes next — no need to move it.
   */
  const deferCurrent = (setStep: SetStep) => {
    deferStep(session.id, setStep.id)
    setWorkTimer(false)
    flash('Saved for the end of the workout')
    window.scrollTo({ top: 0 })
  }

  const applySwap = (setStep: SetStep, name?: string) => {
    swapExercise(session.id, setStep.exercise.id, name)
    setSwapSheet(false)
    flash(name?.trim() ? `Swapped in ${name.trim()}` : `Back to ${setStep.swappedFrom ?? setStep.exercise.name}`)
  }

  const header = (
    <>
      <div className="runner__head">
        <button className="icon-btn" aria-label="Exit workout" onClick={() => setExitSheet(true)}>×</button>
        <div className="center grow truncate">
          <div className="eyebrow">{day.name}</div>
          <div className="tiny dim">
            Set {Math.min(setNumber + 1, setSteps.length)} of {setSteps.length} · {clockTime(elapsed)}
          </div>
        </div>
        <button
          className="icon-btn" aria-label="Previous set"
          onClick={() => goTo(previousSetIndex())} disabled={index === 0}
        >‹</button>
      </div>
      <div className="progress">
        <div className="progress__fill" style={{ width: `${(setNumber / Math.max(1, setSteps.length)) * 100}%` }} />
      </div>
    </>
  )

  /* ------------------------------------------------------------ rest step */
  if (step?.kind === 'rest') {
    const upcoming = nextSetStep(steps, index)
    return (
      <div className="runner">
        {header}
        <FullscreenTimer
          seconds={step.seconds}
          label={step.label}
          sublabel={`${durationWords(step.seconds)} prescribed`}
          onFinish={() => goTo(index + 1)}
          finishLabel={upcoming ? 'Next set' : 'Finish workout'}
          onSkip={() => goTo(index + 1)}
        >
          {upcoming && (
            <div className="card card--tight card--flat">
              <div className="card__label">Up next</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 24, lineHeight: 1.1 }}>
                {upcoming.exercise.name}
              </div>
              <div className="hint">
                {setTargetLine(upcoming.set, settings.units) || repsTarget(upcoming.set) || 'Next set'}
              </div>
            </div>
          )}
        </FullscreenTimer>
        {exitSheet && <ExitSheet onClose={() => setExitSheet(false)} onFinish={() => setFinishing(true)} navigate={navigate} sessionId={session.id} />}
      </div>
    )
  }

  if (!step || step.kind !== 'set') return null

  /* ------------------------------------------------- timed set, running */
  if (workTimer) {
    const seconds = step.set.durationSeconds ?? 60
    return (
      <div className="runner">
        {header}
        <FullscreenTimer
          seconds={seconds}
          label={step.exercise.name}
          sublabel={setTargetLine(step.set, settings.units)}
          accent="var(--lime)"
          onFinish={() => {
            setDrafts((prev) => ({ ...prev, [step.id]: { ...values(step), durationSeconds: seconds } }))
            setWorkTimer(false)
          }}
          finishLabel="Done — log it"
          onSkip={() => setWorkTimer(false)}
        />
        {exitSheet && <ExitSheet onClose={() => setExitSheet(false)} onFinish={() => setFinishing(true)} navigate={navigate} sessionId={session.id} />}
      </div>
    )
  }

  /* -------------------------------------------------------- logging a set */
  const restSeconds = steps[index + 1]?.kind === 'rest' ? (steps[index + 1] as { seconds: number }).seconds : 0
  // Matched on name as well as id, so a swapped-in movement does not claim the
  // sets that were done before the swap.
  const todaysLogs = session.logs
    .filter((l) => l.exerciseId === step.exercise.id && l.exerciseName === step.exercise.name)
    .sort((a, b) => a.round - b.round || a.setIndex - b.setIndex)

  return (
    <div className="runner">
      {header}
      <SetLogger
        key={step.id}
        step={step}
        units={settings.units}
        weightIncrement={settings.weightIncrement}
        values={values(step)}
        onChange={(next) => setDrafts((prev) => ({ ...prev, [step.id]: next }))}
        lastTime={lastTime}
        todaysLogs={todaysLogs}
        restSeconds={restSeconds}
        onLog={() => writeLog(step, values(step), false)}
        onSkip={() => writeLog(step, values(step), true)}
        onStartTimer={step.set.durationSeconds ? () => setWorkTimer(true) : undefined}
        onSwap={() => setSwapSheet(true)}
        onDefer={nextSetStep(steps, index + 1) ? () => deferCurrent(step) : undefined}
      />
      {swapSheet && (
        <SwapSheet
          plan={plan} day={day} step={step}
          onClose={() => setSwapSheet(false)}
          onChoose={(name) => applySwap(step, name)}
        />
      )}
      {exitSheet && <ExitSheet onClose={() => setExitSheet(false)} onFinish={() => setFinishing(true)} navigate={navigate} sessionId={session.id} />}
    </div>
  )
}

/** Sensible starting numbers so most sets need no adjustment at all. */
function initialValues(step: SetStep, session: Session, lastTime?: LastTime): LoggedValues {
  const existing = session.logs.find((l) => l.stepId === step.id)
  if (existing && !existing.skipped) {
    return {
      weight: existing.weight, reps: existing.reps, incline: existing.incline,
      level: existing.level, speed: existing.speed, distance: existing.distance,
      durationSeconds: existing.durationSeconds, rpe: existing.rpe, notes: existing.notes,
    }
  }

  const set = step.set
  // What the user already did for this exercise today, then what they did last time.
  const carried = [...session.logs].reverse().find(
    (l) => l.exerciseId === step.exercise.id && l.exerciseName === step.exercise.name && !l.skipped,
  )
  const previous = lastTime?.logs[Math.min(step.setIndex, (lastTime?.logs.length ?? 1) - 1)]

  const pick = (
    target: number | undefined,
    carry: number | undefined,
    before: number | undefined,
  ) => target ?? carry ?? before

  return {
    // An explicit target wins, so ramped warm-ups are not flattened by carry-over.
    weight: pick(set.targetWeight, carried?.weight, previous?.weight),
    reps: set.reps ?? set.repRange?.[0] ?? carried?.reps ?? previous?.reps,
    incline: pick(set.targetIncline, carried?.incline, previous?.incline),
    level: pick(set.targetLevel, carried?.level, previous?.level),
    speed: pick(set.targetSpeed, carried?.speed, previous?.speed),
    distance: set.targetDistance?.value ?? previous?.distance,
    durationSeconds: set.durationSeconds ?? previous?.durationSeconds,
  }
}

/** A card that slides up from the bottom edge, dismissed by tapping outside it. */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(3,4,10,0.72)',
        display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%', borderRadius: '20px 20px 0 0',
          paddingBottom: 'calc(var(--safe-bottom) + 16px)',
          maxHeight: '86dvh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Machine taken, shoulder complaining, dumbbells missing: do something else for
 * the rest of the workout, against the same prescription.
 */
function SwapSheet({
  plan, day, step, onClose, onChoose,
}: {
  plan: WorkoutPlan
  day: PlanDay
  step: SetStep
  onClose: () => void
  onChoose: (name?: string) => void
}) {
  const [name, setName] = useState('')

  // Other movements of the same kind that the plan already uses — usually where
  // a sensible substitute comes from, and one tap instead of typing. Today's
  // first: they were chosen for today's focus, so they are the closest match.
  const suggestions = useMemo(() => {
    const seen = new Set([normaliseName(step.exercise.name), normaliseName(step.swappedFrom ?? '')])
    const names: string[] = []
    for (const source of [day, ...plan.days.filter((d) => d.id !== day.id)]) {
      for (const block of source.blocks) {
        for (const exercise of block.exercises) {
          const key = normaliseName(exercise.name)
          if (exercise.modality !== step.exercise.modality || seen.has(key)) continue
          seen.add(key)
          names.push(exercise.name)
        }
      }
    }
    return names.slice(0, 6)
  }, [plan, day, step])

  return (
    <Sheet onClose={onClose}>
      <div className="card__label">Swap exercise</div>
      <p className="small muted">
        Instead of {step.exercise.name}, for the rest of this workout. Sets, reps and rest stay
        as prescribed; the target load doesn't carry over, and the log records what you
        actually did.
      </p>

      <input
        className="input" autoFocus value={name} placeholder="What are you doing instead?"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onChoose(name) }}
      />
      <button
        className="btn btn--primary btn--block" disabled={!name.trim()}
        onClick={() => onChoose(name)}
      >Use this instead</button>

      {suggestions.length > 0 && (
        <>
          <div className="card__label">Elsewhere in your plan</div>
          <div className="chips">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="chip" onClick={() => onChoose(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </>
      )}

      {step.swappedFrom && (
        <button className="btn btn--ghost btn--block" onClick={() => onChoose(undefined)}>
          Back to {step.swappedFrom}
        </button>
      )}
      <button className="btn btn--quiet btn--block" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}

function ExitSheet({
  onClose, onFinish, navigate, sessionId,
}: { onClose: () => void; onFinish: () => void; navigate: Navigate; sessionId: string }) {
  const { abandonSession } = useStore()
  return (
    <Sheet onClose={onClose}>
      <div className="card__label">Leaving already?</div>
      <button className="btn btn--lime btn--block" onClick={onFinish}>Finish and save</button>
      <button className="btn btn--ghost btn--block" onClick={() => navigate('/')}>
        Pause — keep it for later
      </button>
      <button
        className="btn btn--danger btn--block"
        onClick={() => {
          if (window.confirm('Discard this workout and everything logged in it?')) {
            abandonSession(sessionId)
            navigate('/')
          }
        }}
      >
        Discard workout
      </button>
      <button className="btn btn--quiet btn--block" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}
