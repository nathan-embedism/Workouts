import type { Navigate } from '../App'
import { useStore } from '../lib/store'
import { backupStatus } from '../lib/history'
import { nextDayFor, completedCount } from '../lib/plan'
import { countSets, estimateMinutes } from '../lib/steps'
import { daysUntil, relativeDays } from '../lib/format'
import { useIsStandalone } from '../lib/hooks'
import { Banner } from '../components/ui'

export default function Home({ navigate }: { navigate: Navigate }) {
  const { activePlan, sessions, settings, activeSession, storageError } = useStore()
  const standalone = useIsStandalone()
  const backup = backupStatus(settings, sessions)

  if (!activePlan) {
    return (
      <main className="page">
        <header className="topbar">
          <div>
            <div className="eyebrow">Workout runner</div>
            <h1 className="topbar__title">Neon Sets</h1>
          </div>
        </header>

        <div className="card card--glow">
          <div className="card__label">Start here</div>
          <p className="muted">
            This app doesn't write your plan — your AI tool does. Build a prompt describing
            the training you want, paste the reply back in, and the app turns it into a
            guided workout with timers and logging.
          </p>
          <button className="btn btn--primary btn--block btn--xl" onClick={() => navigate('/prompt')}>
            Build my prompt
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => navigate('/import')}>
            I already have the JSON
          </button>
        </div>

        {!standalone && <InstallHint />}
      </main>
    )
  }

  const plan = activePlan.plan
  const nextDay = nextDayFor(plan, sessions, activePlan.id)
  const lastSession = sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  const upcomingEvents = (plan.events ?? [])
    .map((e) => ({ ...e, days: daysUntil(e.date) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)

  return (
    <main className="page">
      <header className="topbar">
        <div className="grow truncate">
          <div className="eyebrow">{plan.planName}</div>
          <h1 className="topbar__title">Today</h1>
        </div>
        <span className="pill">{plan.units}</span>
      </header>

      {storageError && <Banner tone="error">{storageError}</Banner>}

      {backup.due && (
        <Banner
          tone="warn"
          action={<button className="btn btn--sm btn--ghost" onClick={() => navigate('/data')}>Back up</button>}
        >
          <strong>Save your data.</strong> {backup.message}
        </Banner>
      )}

      {activeSession && (
        <div className="card card--glow">
          <div className="card__label">In progress</div>
          <div className="row-between">
            <div className="grow truncate">
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 22 }}>{activeSession.dayName}</div>
              <div className="hint">
                {activeSession.logs.length} set{activeSession.logs.length === 1 ? '' : 's'} logged · started {relativeDays(activeSession.startedAt)}
              </div>
            </div>
          </div>
          <button className="btn btn--hot btn--block btn--xl" onClick={() => navigate('/run')}>
            Resume workout
          </button>
        </div>
      )}

      {!activeSession && nextDay && (
        <div className="card card--glow">
          <div className="card__label">Up next</div>
          <div className="exercise-name" style={{ fontSize: 'clamp(2.2rem, 11vw, 3.4rem)' }}>{nextDay.name}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="pill pill--accent">{countSets(nextDay)} sets</span>
            <span className="pill">~{estimateMinutes(nextDay)} min</span>
            {nextDay.focus?.slice(0, 2).map((f) => <span key={f} className="pill">{f}</span>)}
          </div>
          {nextDay.notes && <p className="hint">{nextDay.notes}</p>}
          <button
            className="btn btn--primary btn--block btn--xl"
            onClick={() => navigate(`/day?d=${encodeURIComponent(nextDay.id)}`)}
          >
            Start workout
          </button>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <button
          type="button"
          className="card card--tight"
          style={{ textAlign: 'left' }}
          onClick={() => navigate('/schedule')}
        >
          <div className="card__label">Key dates</div>
          {upcomingEvents.slice(0, 3).map((event) => (
            <div key={`${event.name}-${event.date}`} className="row-between">
              <span className="grow truncate">{event.name}</span>
              <span className="pill pill--warm">
                {event.days === 0 ? 'Today' : `${event.days} day${event.days === 1 ? '' : 's'}`}
              </span>
            </div>
          ))}
        </button>
      )}

      <section className="stack-sm">
        <div className="row-between">
          <div className="eyebrow">The plan</div>
          <button className="btn btn--quiet btn--sm" onClick={() => navigate('/schedule')}>
            Schedule &amp; dates →
          </button>
        </div>
        {plan.days.map((day) => {
          const isRest = day.type === 'rest' || day.blocks.length === 0
          const done = completedCount(sessions, activePlan.id, day.id)
          return (
            <button
              key={day.id}
              type="button"
              className={`plan-day${isRest ? ' plan-day--rest' : ''}${day.id === nextDay?.id ? ' plan-day--next' : ''}`}
              onClick={() => !isRest && navigate(`/day?d=${encodeURIComponent(day.id)}`)}
              disabled={isRest}
            >
              <span className="plan-day__num">{day.dayNumber}</span>
              <span className="grow">
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 19, display: 'block' }}>{day.name}</span>
                <span className="hint">
                  {isRest ? 'Rest day' : `${countSets(day)} sets · ~${estimateMinutes(day)} min`}
                  {day.weekday ? ` · ${day.weekday}` : ''}
                </span>
              </span>
              {done > 0 && <span className="pill pill--accent">×{done}</span>}
            </button>
          )
        })}
      </section>

      {plan.notes && (
        <div className="card card--tight card--flat">
          <div className="card__label">Plan notes</div>
          <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{plan.notes}</p>
        </div>
      )}

      {lastSession && (
        <button className="btn btn--quiet btn--block" onClick={() => navigate('/history')}>
          Last workout: {lastSession.dayName}, {relativeDays(lastSession.startedAt)} →
        </button>
      )}

      {!standalone && <InstallHint />}
    </main>
  )
}

function InstallHint() {
  return (
    <div className="card card--tight card--flat">
      <div className="card__label">Put it on your home screen</div>
      <p className="small muted">
        <strong>iPhone:</strong> tap Share, then “Add to Home Screen”.<br />
        <strong>Android:</strong> tap the ⋮ menu, then “Install app” or “Add to Home screen”.
      </p>
      <p className="hint">It then runs full screen and works offline — your data stays on the device.</p>
    </div>
  )
}
