import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, SetLog, Units } from '../types'
import { isCountable, trackingFieldsFor, type AmrapStep } from '../lib/steps'
import { lastTimeFor } from '../lib/history'
import { clockTime, durationWords, setTargetLine } from '../lib/format'
import { beep, vibrate } from '../lib/hooks'
import { useStore } from '../lib/store'
import { RpePicker, Stepper } from './ui'

/** One unbroken stretch on one exercise, from a switch to the next. */
interface Stint {
  exerciseIndex: number
  startedAt: number
}

interface Live {
  sessionId: string
  stepId: string
  startedAt: number
  stints: Stint[]
  /** Set once the cap is hit or the user ends it early. */
  endedAt?: number
}

// The clock runs across a locked phone or a reload, so the running AMRAP is
// kept outside React. It is scratch state, never part of the saved log.
const LIVE_KEY = 'neon-sets:amrap-live'

/** Per-round target, without the "AMRAP" every set in the block carries. */
function perRound(exercise: Exercise, units: Units): string {
  const set = exercise.sets[0]
  return set ? setTargetLine({ ...set, type: 'working' }, units) : ''
}

function readLive(sessionId: string, stepId: string): Live | undefined {
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    if (!raw) return undefined
    const live = JSON.parse(raw) as Live
    return live.sessionId === sessionId && live.stepId === stepId && Array.isArray(live.stints) ? live : undefined
  } catch {
    return undefined
  }
}

function writeLive(live: Live | undefined) {
  try {
    if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live))
    else localStorage.removeItem(LIVE_KEY)
  } catch { /* storage unavailable: the AMRAP still runs, it just won't survive a reload */ }
}

export default function AmrapRunner({
  step, sessionId, units, weightIncrement, restSeconds, onLog, onSkip,
}: {
  step: AmrapStep
  sessionId: string
  units: Units
  weightIncrement: number
  restSeconds: number
  onLog: (logs: SetLog[]) => void
  onSkip: () => void
}) {
  const { sessions, settings } = useStore()
  const [live, setLiveState] = useState<Live | undefined>(() => readLive(sessionId, step.id))
  const [now, setNow] = useState(() => Date.now())
  const [reps, setReps] = useState<Record<number, number | undefined>>({})
  const [weights, setWeights] = useState<Record<number, number>>({})
  const [rpe, setRpe] = useState<number | undefined>()
  const [notes, setNotes] = useState('')
  const pipRef = useRef(-1)

  const setLive = (next: Live | undefined) => {
    setLiveState(next)
    writeLive(next)
  }

  const exercises = step.exercises
  const capMs = step.seconds * 1000
  const lastTimes = useMemo(
    () => exercises.map((e) => lastTimeFor(sessions, e.name, units, sessionId)),
    [exercises, sessions, units, sessionId],
  )
  const alreadyLogged = sessions
    .find((s) => s.id === sessionId)?.logs
    .filter((l) => l.stepId.startsWith(`${step.id}:`) && !l.skipped) ?? []

  const running = !!live && live.endedAt === undefined

  // Tick while running; the time itself always comes from the wall clock.
  useEffect(() => {
    if (!running || !live) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const left = Math.ceil((live.startedAt + capMs - t) / 1000)
      if (left > 0 && left <= 3 && left !== pipRef.current) {
        pipRef.current = left
        if (settings.sound) beep(660, 90, 0.16)
      }
      if (t >= live.startedAt + capMs) {
        if (settings.sound) beep(1040, 420, 0.28)
        if (settings.vibrate) vibrate([180, 90, 180])
        setLive({ ...live, endedAt: live.startedAt + capMs })
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [running, live, capMs, settings.sound, settings.vibrate])

  const stintSeconds = (l: Live, i: number): number => {
    const end = l.stints[i + 1]?.startedAt ?? l.endedAt ?? Math.min(now, l.startedAt + capMs)
    return Math.max(0, (end - l.stints[i].startedAt) / 1000)
  }

  const start = () => {
    const t = Date.now()
    pipRef.current = -1
    setReps({})
    setNow(t)
    setLive({ sessionId, stepId: step.id, startedAt: t, stints: [{ exerciseIndex: 0, startedAt: t }] })
    if (settings.sound) beep(880, 160)
  }

  const switchExercise = () => {
    if (!live) return
    const current = live.stints[live.stints.length - 1].exerciseIndex
    const t = Date.now()
    setLive({ ...live, stints: [...live.stints, { exerciseIndex: (current + 1) % exercises.length, startedAt: t }] })
    if (settings.sound) beep(880, 120, 0.2)
    if (settings.vibrate) vibrate(60)
  }

  const undoSwitch = () => {
    if (!live || live.stints.length < 2) return
    setLive({ ...live, stints: live.stints.slice(0, -1) })
  }

  const endEarly = () => {
    if (!live) return
    setLive({ ...live, endedAt: Date.now() })
    if (settings.vibrate) vibrate([120, 60, 120])
  }

  const log = () => {
    if (!live) return
    const entries: SetLog[] = live.stints.map((stint, i) => {
      const exercise = exercises[stint.exerciseIndex]
      const entry: SetLog = {
        sessionId,
        stepId: `${step.id}:${i}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        blockId: step.blockId,
        setIndex: i,
        round: Math.floor(i / exercises.length),
        setType: 'amrap',
        units,
        at: new Date(stint.startedAt).toISOString(),
        durationSeconds: Math.round(stintSeconds(live, i)),
      }
      const count = reps[i]
      if (count) entry.reps = count
      const set = exercise.sets[0]
      const weight = weights[stint.exerciseIndex]
        ?? (set && trackingFieldsFor(exercise, set).includes('weight') ? set.targetWeight : undefined)
      if (weight) entry.weight = weight
      if (rpe !== undefined) entry.rpe = rpe
      if (i === 0 && notes.trim()) entry.notes = notes.trim()
      return entry
    })
    setLive(undefined)
    onLog(entries)
  }

  const redo = () => {
    if (window.confirm('Throw away this attempt and start the AMRAP again?')) setLive(undefined)
  }

  const title = step.blockName ?? `${durationWords(step.seconds)} AMRAP`

  /* ------------------------------------------------------------ ready */
  if (!live) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="pill pill--accent">AMRAP</span>
          <span className="pill">{durationWords(step.seconds)} on the clock</span>
          <span className="pill">{exercises.length} exercises</span>
        </div>

        <div className="exercise-name">{title}</div>

        <div className="card card--tight">
          <div className="card__label">Alternate, in order</div>
          {exercises.map((exercise, i) => {
            const target = perRound(exercise, units)
            const last = lastTimes[i]
            return (
              <div key={exercise.id} className="stack-sm" style={{ gap: 2 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="dim tiny" style={{ width: 16 }}>{i + 1}</span>
                  <span className="grow" style={{ fontFamily: 'var(--font-ui)', fontSize: 22, lineHeight: 1.1 }}>
                    {exercise.name}
                  </span>
                </div>
                {(target || exercise.cues) && (
                  <div className="hint" style={{ paddingLeft: 26 }}>{[target, exercise.cues].filter(Boolean).join(' · ')}</div>
                )}
                {last && (
                  <div className="hint" style={{ paddingLeft: 26 }}>Last time ({last.when}): {last.detail || '—'}</div>
                )}
              </div>
            )
          })}
        </div>

        {step.blockNotes && <p className="small muted">{step.blockNotes}</p>}

        <p className="hint">
          Tap <strong>Switch</strong> every time you change exercise. The time on each one is logged,
          and you can add rep counts at the end.
        </p>

        {alreadyLogged.length > 0 && (
          <p className="hint">Already logged {alreadyLogged.length} stints for this AMRAP. Starting again replaces them.</p>
        )}

        <div className="sticky-actions">
          <button className="btn btn--lime btn--block btn--xl" onClick={start}>
            Start {durationWords(step.seconds)} AMRAP
          </button>
          <button className="btn btn--quiet btn--block" onClick={onSkip}>Skip this AMRAP</button>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- running */
  if (running) {
    const remaining = Math.max(0, (live.startedAt + capMs - now) / 1000)
    const currentIndex = live.stints[live.stints.length - 1].exerciseIndex
    const current = exercises[currentIndex]
    const next = exercises[(currentIndex + 1) % exercises.length]
    const round = Math.floor((live.stints.length - 1) / exercises.length) + 1
    const onThis = stintSeconds(live, live.stints.length - 1)
    const target = perRound(current, units)
    const previous = live.stints.length > 1 ? live.stints.length - 2 : undefined
    const colour = remaining <= 10 ? 'var(--magenta)' : 'var(--lime)'

    return (
      <div className="stack" style={{ flex: 1, gap: 18 }}>
        <div className="center stack-sm">
          <div className="eyebrow" style={{ color: colour }}>{title} · round {round}</div>
          <div
            className="timer-digits"
            style={{ color: colour, '--accent': colour, fontSize: 'min(22vw, 120px)' } as React.CSSProperties}
            role="timer"
            aria-live="off"
          >
            {clockTime(remaining)}
          </div>
          <div className="muted small">left</div>
        </div>

        <div className="card card--glow center stack-sm">
          <div className="card__label">Now</div>
          <div className="exercise-name">{current.name}</div>
          {target && <div className="hint">{target}</div>}
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 28 }}>{clockTime(onThis)}</div>
          <div className="tiny dim">on this exercise</div>
        </div>

        {previous !== undefined && (
          <p className="hint center">
            Last: {exercises[live.stints[previous].exerciseIndex].name} {clockTime(stintSeconds(live, previous))}
          </p>
        )}

        <div className="sticky-actions">
          <button className="btn btn--primary btn--block btn--xl" style={{ minHeight: 110 }} onClick={switchExercise}>
            Switch to {next.name}
          </button>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn--ghost grow" onClick={undoSwitch} disabled={live.stints.length < 2}>
              Undo switch
            </button>
            <button className="btn btn--ghost grow" onClick={endEarly}>End now</button>
          </div>
        </div>
      </div>
    )
  }

  /* ----------------------------------------------------------- review */
  const totalSeconds = ((live.endedAt ?? now) - live.startedAt) / 1000
  const fullRounds = Math.floor(live.stints.length / exercises.length)
  const extra = live.stints.length % exercises.length
  const totals = exercises.map((exercise, ei) => {
    const idx = live.stints.map((s, i) => (s.exerciseIndex === ei ? i : -1)).filter((i) => i >= 0)
    const seconds = idx.reduce((sum, i) => sum + stintSeconds(live, i), 0)
    const counted = idx.map((i) => reps[i]).filter((r): r is number => !!r)
    return {
      exercise,
      stints: idx.length,
      seconds,
      reps: counted.length ? counted.reduce((a, b) => a + b, 0) : undefined,
      countable: isCountable(exercise),
      tracksWeight: exercise.sets[0] ? trackingFieldsFor(exercise, exercise.sets[0]).includes('weight') : false,
    }
  })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="pill pill--accent">AMRAP done</span>
        <span className="pill">{clockTime(totalSeconds)}</span>
        <span className="pill">
          {fullRounds} {fullRounds === 1 ? 'round' : 'rounds'}{extra ? ` + ${extra}` : ''}
        </span>
      </div>

      <div className="exercise-name">{title}</div>

      <div className="card card--tight">
        <div className="card__label">Per exercise</div>
        {totals.map((t) => (
          <div key={t.exercise.id} className="log-line">
            <span className="grow">{t.exercise.name}</span>
            <span className="dim tiny">{t.stints}×</span>
            <span>{clockTime(t.seconds)}</span>
            {t.reps !== undefined && <span>· {t.reps} reps</span>}
          </div>
        ))}
      </div>

      <div className="card card--tight card--flat">
        <div className="card__label">Each stint</div>
        {totals.some((t) => t.countable) && (
          <p className="hint">Rep counts are optional. Leave any blank you didn't count.</p>
        )}
        {live.stints.map((stint, i) => {
          const exercise = exercises[stint.exerciseIndex]
          const countable = totals[stint.exerciseIndex].countable
          return (
            <div key={i} className="log-line" style={{ alignItems: 'center' }}>
              <span className="dim tiny" style={{ width: 26, flex: 'none' }}>R{Math.floor(i / exercises.length) + 1}</span>
              <span className="grow truncate">{exercise.name}</span>
              <span style={{ width: 52, textAlign: 'right' }}>{clockTime(stintSeconds(live, i))}</span>
              {countable ? (
                <input
                  className="input"
                  style={{ width: 84, minHeight: 44, padding: '0 10px', textAlign: 'center' }}
                  inputMode="numeric"
                  enterKeyHint="next"
                  aria-label={`Reps for ${exercise.name}, stint ${i + 1}`}
                  placeholder="reps"
                  value={reps[i] ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                    setReps((prev) => ({ ...prev, [i]: Number.isFinite(n) && n > 0 ? n : undefined }))
                  }}
                />
              ) : (
                <span style={{ width: 84, flex: 'none' }} />
              )}
            </div>
          )
        })}
      </div>

      {totals.map((t, ei) => t.tracksWeight && (
        <div key={t.exercise.id} className="stack-sm">
          <span className="field__label">{t.exercise.name} weight ({units})</span>
          <Stepper
            ariaLabel={`${t.exercise.name} weight`} unit={units} step={weightIncrement} decimals={2}
            value={weights[ei] ?? t.exercise.sets[0]?.targetWeight ?? 0}
            onChange={(w) => setWeights((prev) => ({ ...prev, [ei]: w }))}
          />
        </div>
      ))}

      <div className="stack-sm">
        <span className="field__label">How hard was that? (RPE)</span>
        <RpePicker value={rpe} onChange={setRpe} />
      </div>

      <div className="stack-sm">
        <span className="field__label">Note</span>
        <input
          className="input" value={notes} placeholder="Form went on the last round…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="sticky-actions">
        <button className="btn btn--primary btn--block btn--xl" onClick={log}>
          {restSeconds > 0 ? `Log AMRAP · rest ${durationWords(restSeconds)}` : 'Log AMRAP'}
        </button>
        <button className="btn btn--quiet btn--block" onClick={redo}>Redo from the start</button>
      </div>
    </div>
  )
}
