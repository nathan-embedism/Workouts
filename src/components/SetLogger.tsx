import { useState } from 'react'
import type { SetLog, Units } from '../types'
import type { SetStep } from '../lib/steps'
import { trackingFieldsFor } from '../lib/steps'
import type { LastTime } from '../lib/history'
import { durationWords, repsTarget, roundLoad, setTypeLabel } from '../lib/format'
import { RpePicker, Stepper } from './ui'

export interface LoggedValues {
  weight?: number
  reps?: number
  incline?: number
  level?: number
  speed?: number
  distance?: number
  durationSeconds?: number
  rpe?: number
  notes?: string
}

const DISTANCE_STEP: Record<string, number> = { m: 50, km: 0.5, mi: 0.25, cal: 5, floors: 5 }

export default function SetLogger({
  step, units, weightIncrement, values, onChange, lastTime, todaysLogs,
  onLog, onSkip, onStartTimer, onSwap, onDefer, restSeconds,
}: {
  step: SetStep
  units: Units
  weightIncrement: number
  values: LoggedValues
  onChange: (next: LoggedValues) => void
  lastTime?: LastTime
  todaysLogs: SetLog[]
  onLog: () => void
  onSkip: () => void
  onStartTimer?: () => void
  onSwap: () => void
  /** Absent on the last set of the workout, where there is no "later" left. */
  onDefer?: () => void
  restSeconds: number
}) {
  const [showNote, setShowNote] = useState(!!values.notes)
  const fields = trackingFieldsFor(step.exercise, step.set)
  const set = step.set
  const target = repsTarget(set)

  const patch = (next: Partial<LoggedValues>) => onChange({ ...values, ...next })

  const drops = set.drops?.map((drop) => {
    const base = values.weight ?? set.targetWeight
    const weight = drop.weight ?? (base !== undefined && drop.weightPercent !== undefined
      ? roundLoad(Math.round((base * drop.weightPercent / 100) / weightIncrement) * weightIncrement)
      : undefined)
    const reps = drop.toFailure ? 'to failure' : drop.reps !== undefined ? `× ${drop.reps}` : ''
    return `${weight !== undefined ? `${weight} ${units}` : 'drop'} ${reps}`.trim()
  })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="pill pill--accent">
          Set {step.setIndex + 1} of {step.setsInExercise}
        </span>
        {set.type !== 'working' && (
          <span className={`pill${set.type === 'warmup' ? ' pill--warm' : ''}`}>{setTypeLabel(set)}</span>
        )}
        {step.blockKind !== 'single' && (
          <span className="pill">
            {step.blockKind === 'circuit' ? 'Circuit' : 'Superset'} {step.exerciseIndex + 1}/{step.exercisesInBlock}
            {step.totalRounds > 1 ? ` · round ${step.round + 1}/${step.totalRounds}` : ''}
          </span>
        )}
      </div>

      <div>
        <div className="exercise-name">{step.exercise.name}</div>
        {step.swappedFrom && <div className="hint" style={{ marginTop: 6 }}>Swapped in for {step.swappedFrom}</div>}
        {step.exercise.equipment && <div className="hint" style={{ marginTop: 6 }}>{step.exercise.equipment}</div>}
      </div>

      <div className="target-strip">
        {target && (
          <div className="target-strip__item">
            <span className="target-strip__value">{target}</span>
            <span className="target-strip__label">Reps</span>
          </div>
        )}
        {set.targetWeight !== undefined && (
          <div className="target-strip__item">
            <span className="target-strip__value">{set.targetWeight}</span>
            <span className="target-strip__label">Target {units}</span>
          </div>
        )}
        {set.targetWeight === undefined && set.targetWeightPercent !== undefined && (
          <div className="target-strip__item">
            <span className="target-strip__value">{set.targetWeightPercent}%</span>
            <span className="target-strip__label">of 1RM</span>
          </div>
        )}
        {set.durationSeconds !== undefined && (
          <div className="target-strip__item">
            <span className="target-strip__value">{durationWords(set.durationSeconds)}</span>
            <span className="target-strip__label">Duration</span>
          </div>
        )}
        {set.targetDistance && (
          <div className="target-strip__item">
            <span className="target-strip__value">{set.targetDistance.value}</span>
            <span className="target-strip__label">{set.targetDistance.unit}</span>
          </div>
        )}
        {set.tempo && (
          <div className="target-strip__item">
            <span className="target-strip__value">{set.tempo}</span>
            <span className="target-strip__label">Tempo</span>
          </div>
        )}
      </div>

      {(set.notes || step.exercise.cues || step.blockNotes) && (
        <p className="small muted">{[step.exercise.cues, set.notes, step.blockNotes].filter(Boolean).join(' · ')}</p>
      )}

      {lastTime && (
        <div className="card card--tight card--flat">
          <div className="row-between">
            <span className="card__label">Last time</span>
            <span className="tiny dim">{lastTime.when}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 20 }}>{lastTime.detail || '—'}</div>
          <div className="hint">
            {[lastTime.loadRange, lastTime.settingsRange, lastTime.rpe].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {step.exercise.machineSettings?.length ? (
        <p className="hint">Check: {step.exercise.machineSettings.join(' · ')}</p>
      ) : null}

      {drops?.length ? (
        <div className="card card--tight" style={{ borderColor: 'color-mix(in srgb, var(--magenta) 45%, transparent)' }}>
          <div className="card__label" style={{ color: 'var(--magenta)' }}>Drop set</div>
          <p className="small">Straight after the main set, no rest:</p>
          {drops.map((drop, i) => (
            <div key={i} className="log-line">
              <span className="dim tiny">Drop {i + 1}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 18 }}>{drop}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="stack" style={{ gap: 14 }}>
        {fields.includes('weight') && (
          <LoggerField label={`Weight (${units})`}>
            <Stepper
              ariaLabel="weight" unit={units} step={weightIncrement} decimals={2}
              value={values.weight ?? 0} onChange={(weight) => patch({ weight })}
            />
          </LoggerField>
        )}
        {fields.includes('reps') && (
          <LoggerField label="Reps">
            <Stepper
              ariaLabel="reps" unit="reps" step={1} decimals={0}
              value={values.reps ?? 0} onChange={(reps) => patch({ reps })}
            />
          </LoggerField>
        )}
        {fields.includes('incline') && (
          <LoggerField label="Incline">
            <Stepper
              ariaLabel="incline" unit="incline" step={0.5}
              value={values.incline ?? 0} onChange={(incline) => patch({ incline })}
            />
          </LoggerField>
        )}
        {fields.includes('level') && (
          <LoggerField label="Level / resistance">
            <Stepper
              ariaLabel="level" unit="level" step={1} decimals={0}
              value={values.level ?? 0} onChange={(level) => patch({ level })}
            />
          </LoggerField>
        )}
        {fields.includes('speed') && (
          <LoggerField label="Speed">
            <Stepper
              ariaLabel="speed" unit={units === 'kg' ? 'km/h' : 'mph'} step={0.5}
              value={values.speed ?? 0} onChange={(speed) => patch({ speed })}
            />
          </LoggerField>
        )}
        {fields.includes('distance') && (
          <LoggerField label="Distance">
            <Stepper
              ariaLabel="distance" unit={set.targetDistance?.unit ?? 'm'}
              step={DISTANCE_STEP[set.targetDistance?.unit ?? 'm'] ?? 1}
              value={values.distance ?? 0} onChange={(distance) => patch({ distance })}
            />
          </LoggerField>
        )}
        {fields.includes('duration') && (
          <LoggerField label="Duration">
            <Stepper
              ariaLabel="duration in seconds" unit="seconds" step={15} decimals={0}
              value={values.durationSeconds ?? 0} onChange={(durationSeconds) => patch({ durationSeconds })}
            />
          </LoggerField>
        )}

        <LoggerField label="How hard was that? (RPE)">
          <RpePicker value={values.rpe} onChange={(rpe) => patch({ rpe })} />
          <div className="row-between tiny dim" style={{ marginTop: 4 }}>
            <span>6 · easy</span>
            <span>8 · 2 left in the tank</span>
            <span>10 · max</span>
          </div>
        </LoggerField>

        {showNote ? (
          <LoggerField label="Note">
            <input
              className="input" value={values.notes ?? ''} placeholder="Felt heavy, left knee twinge…"
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </LoggerField>
        ) : (
          <button className="btn btn--quiet btn--sm" onClick={() => setShowNote(true)}>+ Add a note</button>
        )}
      </div>

      {todaysLogs.length > 0 && (
        <div className="card card--tight card--flat">
          <div className="card__label">Today so far</div>
          {todaysLogs.map((log, i) => (
            <div key={log.stepId} className="log-line">
              <span className="dim tiny">Set {i + 1}</span>
              <span>
                {log.skipped ? 'Skipped' : [
                  log.weight !== undefined ? `${log.weight} ${units}` : null,
                  log.reps !== undefined ? `× ${log.reps}` : null,
                  log.level !== undefined ? `L${log.level}` : null,
                  log.durationSeconds !== undefined ? durationWords(log.durationSeconds) : null,
                  log.rpe !== undefined ? `RPE ${log.rpe}` : null,
                ].filter(Boolean).join(' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="sticky-actions">
        {onStartTimer && (
          <button className="btn btn--lime btn--block btn--xl" onClick={onStartTimer}>
            Start {durationWords(set.durationSeconds ?? 60)} timer
          </button>
        )}
        <button className="btn btn--primary btn--block btn--xl" onClick={onLog}>
          {restSeconds > 0 ? `Log set · rest ${durationWords(restSeconds)}` : 'Log set'}
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--quiet btn--sm grow" onClick={onSwap}>
            {step.swappedFrom ? 'Change swap' : 'Swap exercise'}
          </button>
          {onDefer && (
            <button className="btn btn--quiet btn--sm grow" onClick={onDefer}>Save for later</button>
          )}
        </div>
        <button className="btn btn--quiet btn--block" onClick={onSkip}>Skip this set</button>
      </div>
    </div>
  )
}

function LoggerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stack-sm">
      <span className="field__label">{label}</span>
      {children}
    </div>
  )
}
