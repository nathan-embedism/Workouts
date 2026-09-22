import { useMemo, useState } from 'react'
import type { Navigate } from '../App'
import { useStore } from '../lib/store'
import { clockTime, relativeDays, roundLoad, shortDate } from '../lib/format'
import { normaliseName } from '../lib/history'
import Progress from './Progress'
import { Banner, useFlash } from '../components/ui'

export default function History({ navigate }: { navigate: Navigate }) {
  const { sessions, settings, setSessionNotes } = useStore()
  const flash = useFlash()
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'sessions' | 'progress'>('sessions')
  // The workout whose note is being edited, and the text so far.
  const [noteEdit, setNoteEdit] = useState<{ id: string; text: string } | null>(null)

  const saveNote = () => {
    if (!noteEdit) return
    setSessionNotes(noteEdit.id, noteEdit.text.trim() || undefined)
    setNoteEdit(null)
    flash('Note saved')
  }

  const finished = useMemo(
    () => sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions],
  )

  const filtered = useMemo(() => {
    const needle = normaliseName(query)
    if (!needle) return finished
    return finished.filter((session) =>
      normaliseName(session.dayName).includes(needle) ||
      session.logs.some((log) => normaliseName(log.exerciseName).includes(needle)),
    )
  }, [finished, query])

  const totals = useMemo(() => {
    const volume = finished.reduce((total, session) => total + session.logs.reduce(
      (sum, log) => sum + (log.weight !== undefined && log.reps !== undefined ? log.weight * log.reps : 0), 0,
    ), 0)
    return { workouts: finished.length, volume: roundLoad(volume) }
  }, [finished])

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="eyebrow">Everything you've logged</div>
          <h1 className="topbar__title">Log</h1>
        </div>
      </header>

      <div className="chips">
        {([['sessions', 'Sessions'], ['progress', 'Progress']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip${view === id ? ' chip--on' : ''}`}
            onClick={() => setView(id)}
          >{label}</button>
        ))}
      </div>

      {view === 'progress' ? <Progress /> : finished.length === 0 ? (
        <Banner tone="info">
          No finished workouts yet. Start one from the Today tab and it'll show up here.
        </Banner>
      ) : (
        <>
          <div className="card card--tight">
            <div className="row wrap" style={{ gap: 20 }}>
              <div className="target-strip__item">
                <span className="big-number" style={{ color: 'var(--cyan)', fontSize: 44 }}>{totals.workouts}</span>
                <span className="target-strip__label">Workouts</span>
              </div>
              {totals.volume > 0 && (
                <div className="target-strip__item">
                  <span className="big-number" style={{ color: 'var(--lime)', fontSize: 44 }}>
                    {Math.round(totals.volume).toLocaleString()}
                  </span>
                  <span className="target-strip__label">{settings.units} lifted</span>
                </div>
              )}
            </div>
          </div>

          <input
            className="input" value={query} placeholder="Search a day or an exercise"
            onChange={(e) => setQuery(e.target.value)}
          />

          <section className="stack-sm">
            {filtered.map((session) => {
              const open = openId === session.id
              const minutes = session.endedAt
                ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000)
                : 0
              return (
                <div key={session.id} className="card card--tight">
                  <button
                    type="button"
                    className="row-between"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => setOpenId(open ? null : session.id)}
                  >
                    <span className="grow truncate">
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, display: 'block' }}>
                        {session.dayName}
                      </span>
                      <span className="hint">
                        {shortDate(session.startedAt)} · {relativeDays(session.startedAt)} ·{' '}
                        {session.logs.filter((l) => !l.skipped).length} sets
                        {minutes ? ` · ${clockTime(minutes * 60)}` : ''}
                      </span>
                    </span>
                    <span className="dim" aria-hidden>{open ? '▾' : '▸'}</span>
                  </button>

                  {open && (
                    <div className="stack-sm" style={{ marginTop: 6 }}>
                      {session.logs.map((log) => (
                        <div key={log.stepId}>
                          <div className="log-line">
                            <span className="grow truncate">{log.exerciseName}</span>
                            <span className="dim tiny">
                              {log.skipped ? 'skipped' : [
                                log.weight !== undefined ? `${log.weight} ${log.units}` : null,
                                log.reps !== undefined ? `× ${log.reps}` : null,
                                log.incline !== undefined ? `incl ${log.incline}` : null,
                                log.level !== undefined ? `L${log.level}` : null,
                                log.distance !== undefined ? `${log.distance}${log.distanceUnit ?? ''}` : null,
                                log.durationSeconds !== undefined ? clockTime(log.durationSeconds) : null,
                                log.rpe !== undefined ? `RPE ${log.rpe}` : null,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          {log.notes && <p className="hint">“{log.notes}”</p>}
                        </div>
                      ))}

                      {noteEdit?.id === session.id ? (
                        <div className="stack-sm">
                          <span className="field__label">Workout notes</span>
                          <textarea
                            className="textarea" rows={3} autoFocus value={noteEdit.text}
                            placeholder="Felt strong, shoulder fine, gym was packed…"
                            onChange={(e) => setNoteEdit({ id: session.id, text: e.target.value })}
                          />
                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn btn--primary grow" onClick={saveNote}>Save note</button>
                            <button className="btn btn--quiet" onClick={() => setNoteEdit(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="stack-sm">
                          {session.notes && (
                            <>
                              <span className="field__label">Workout notes</span>
                              <p className="hint">“{session.notes}”</p>
                            </>
                          )}
                          <button
                            className="btn btn--quiet btn--sm"
                            onClick={() => setNoteEdit({ id: session.id, text: session.notes ?? '' })}
                          >
                            {session.notes ? 'Edit note' : '+ Add a note'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && <p className="muted small">Nothing matches “{query}”.</p>}
          </section>

          <button className="btn btn--ghost btn--block" onClick={() => navigate('/data')}>
            Back up this data
          </button>
        </>
      )}
    </main>
  )
}
