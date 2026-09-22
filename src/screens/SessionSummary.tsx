import { useMemo, useState } from 'react'
import type { Navigate } from '../App'
import type { Session } from '../types'
import { useStore } from '../lib/store'
import { progressSummary } from '../lib/history'
import { buildFeedbackPrompt } from '../lib/schema'
import { clockTime, roundLoad } from '../lib/format'
import { copyText } from '../lib/hooks'
import { useFlash } from '../components/ui'

export default function SessionSummary({
  session, onResume, navigate,
}: { session: Session; onResume?: () => void; navigate: Navigate }) {
  const { settings, finishSession } = useStore()
  const flash = useFlash()
  const [notes, setNotes] = useState(session.notes ?? '')

  const stats = useMemo(() => {
    const logged = session.logs.filter((l) => !l.skipped)
    const volume = logged.reduce(
      (total, log) => total + (log.weight !== undefined && log.reps !== undefined ? log.weight * log.reps : 0),
      0,
    )
    const rpes = logged.filter((l) => l.rpe !== undefined).map((l) => l.rpe!)
    const byExercise = new Map<string, typeof logged>()
    for (const log of logged) {
      const list = byExercise.get(log.exerciseName) ?? []
      list.push(log)
      byExercise.set(log.exerciseName, list)
    }
    const seconds = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    return {
      sets: logged.length,
      skipped: session.logs.length - logged.length,
      volume: roundLoad(volume),
      avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : undefined,
      byExercise,
      seconds,
    }
  }, [session])

  const save = () => {
    finishSession(session.id, notes.trim() || undefined)
    flash('Workout saved')
    navigate('/')
  }

  const copyForAi = async () => {
    const text = buildFeedbackPrompt(
      progressSummary([{ ...session, notes: notes.trim() || undefined }], settings.units, 1, true),
    )
    flash(await copyText(text) ? 'Copied — paste it to your AI tool' : 'Copy failed')
  }

  return (
    <main className="page page--flush" style={{ maxWidth: 560 }}>
      <header className="topbar">
        <div>
          <div className="eyebrow">{session.dayName}</div>
          <h1 className="topbar__title">Done</h1>
        </div>
      </header>

      <div className="card card--glow">
        <div className="row wrap" style={{ gap: 20 }}>
          <div className="target-strip__item">
            <span className="big-number" style={{ color: 'var(--cyan)' }}>{stats.sets}</span>
            <span className="target-strip__label">Sets logged</span>
          </div>
          <div className="target-strip__item">
            <span className="big-number" style={{ color: 'var(--lime)' }}>{clockTime(stats.seconds)}</span>
            <span className="target-strip__label">Duration</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {stats.volume > 0 && <span className="pill pill--accent">{stats.volume} {settings.units} volume</span>}
          {stats.avgRpe !== undefined && <span className="pill">avg RPE {stats.avgRpe}</span>}
          {stats.skipped > 0 && <span className="pill">{stats.skipped} skipped</span>}
        </div>
      </div>

      <div className="card">
        <div className="card__label">What you did</div>
        {[...stats.byExercise.entries()].map(([name, logs]) => (
          <div key={name} className="stack-sm">
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 19 }}>{name}</div>
            <div className="hint">
              {logs.map((log) => [
                log.weight !== undefined ? `${log.weight}${settings.units}` : null,
                log.reps !== undefined ? `×${log.reps}` : null,
                log.level !== undefined ? `L${log.level}` : null,
                log.durationSeconds !== undefined ? `${Math.round(log.durationSeconds / 60)}m` : null,
                log.rpe !== undefined ? `@${log.rpe}` : null,
              ].filter(Boolean).join(' ')).join('  ·  ')}
            </div>
          </div>
        ))}
        {stats.byExercise.size === 0 && <p className="muted small">Nothing logged in this one.</p>}
      </div>

      <label className="field">
        <span className="field__label">Workout notes</span>
        <textarea
          className="textarea" rows={4} value={notes}
          placeholder="How did it go? Felt strong, shoulder fine, gym was packed…"
          onChange={(e) => setNotes(e.target.value)}
        />
        <span className="hint">
          Saved with the workout — you can read it, and change it, in the Log tab later.
        </span>
      </label>

      <div className="stack">
        <button className="btn btn--primary btn--block btn--xl" onClick={save}>Save workout</button>
        <button className="btn btn--ghost btn--block" onClick={copyForAi}>Copy for my AI tool</button>
        {onResume && <button className="btn btn--quiet btn--block" onClick={onResume}>Back to the workout</button>}
      </div>
    </main>
  )
}
