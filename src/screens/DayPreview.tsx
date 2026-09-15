import type { Navigate } from '../App'
import { useStore } from '../lib/store'
import { findDay } from '../lib/plan'
import { countSets, estimateMinutes } from '../lib/steps'
import { durationWords, repsTarget, setTargetLine } from '../lib/format'
import { lastTimeFor } from '../lib/history'
import { Banner } from '../components/ui'

export default function DayPreview({ dayId, navigate }: { dayId: string; navigate: Navigate }) {
  const { activePlan, sessions, settings, activeSession, startSession } = useStore()
  const day = activePlan ? findDay(activePlan.plan, dayId) : undefined

  if (!activePlan || !day) {
    return (
      <main className="page">
        <Banner tone="error">That day isn't in the current plan.</Banner>
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/')}>Back to today</button>
      </main>
    )
  }

  const begin = () => {
    // Picking the same day again should carry on, not throw away logged sets.
    if (activeSession?.dayId !== day.id) {
      startSession(activePlan.id, day.id, day.name, activePlan.plan.planName)
    }
    navigate('/run')
  }

  return (
    <main className="page">
      <header className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => navigate('/')}>‹</button>
        <div className="grow truncate center">
          <div className="eyebrow">Day {day.dayNumber}</div>
        </div>
        <span className="pill">{countSets(day)} sets</span>
      </header>

      <div className="exercise-name">{day.name}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="pill pill--accent">~{estimateMinutes(day)} min</span>
        {day.weekday && <span className="pill">{day.weekday}</span>}
        {day.focus?.map((f) => <span key={f} className="pill">{f}</span>)}
      </div>
      {day.notes && <p className="small muted">{day.notes}</p>}

      {activeSession && activeSession.dayId !== day.id && (
        <Banner
          tone="warn"
          action={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/run')}>Resume</button>}
        >
          <strong>{activeSession.dayName}</strong> is still open. Starting this one will close it.
        </Banner>
      )}

      {day.blocks.map((block) => (
        <div key={block.id} className="card">
          <div className="row-between">
            <div className="card__label">
              {block.kind === 'single' ? 'Straight sets' : block.kind === 'circuit' ? 'Circuit' : 'Superset'}
              {block.name ? ` · ${block.name}` : ''}
            </div>
            {block.kind !== 'single' && block.rounds && (
              <span className="pill">{block.rounds} rounds</span>
            )}
          </div>

          {block.exercises.map((exercise) => {
            const last = lastTimeFor(sessions, exercise.name, settings.units)
            return (
              <div key={exercise.id} className="stack-sm">
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 22, lineHeight: 1.1 }}>{exercise.name}</div>
                {exercise.equipment && <div className="hint">{exercise.equipment}</div>}
                {exercise.sets.map((set, i) => (
                  <div key={i} className="log-line">
                    <span className="dim tiny" style={{ width: 54, flex: 'none' }}>
                      {set.type === 'warmup' ? 'Warm-up' : `Set ${i + 1}`}
                    </span>
                    <span className="grow">{setTargetLine(set, settings.units) || repsTarget(set) || '—'}</span>
                    {set.restSeconds ? <span className="dim tiny">rest {durationWords(set.restSeconds)}</span> : null}
                  </div>
                ))}
                {last && (
                  <div className="hint">
                    Last time ({last.when}): {last.detail}
                    {last.loadRange ? ` · ${last.loadRange}` : ''}
                    {last.rpe ? ` · ${last.rpe}` : ''}
                  </div>
                )}
              </div>
            )
          })}

          {block.notes && <p className="hint">{block.notes}</p>}
        </div>
      ))}

      <div className="sticky-actions">
        <button className="btn btn--primary btn--block btn--xl" onClick={begin}>
          {activeSession?.dayId === day.id ? 'Resume workout' : 'Start workout'}
        </button>
      </div>
    </main>
  )
}
