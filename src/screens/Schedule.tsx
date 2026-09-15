import type { Navigate } from '../App'
import type { PlanDay } from '../types'
import { useStore } from '../lib/store'
import { countSets, estimateMinutes } from '../lib/steps'
import { completedCount, nextDayFor } from '../lib/plan'
import { daysUntil } from '../lib/format'
import { Banner } from '../components/ui'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function weekdayIndex(name?: string): number | undefined {
  if (!name) return undefined
  const needle = name.trim().slice(0, 3).toLowerCase()
  const index = WEEKDAYS.findIndex((day) => day.slice(0, 3).toLowerCase() === needle)
  return index === -1 ? undefined : index
}

export default function Schedule({ navigate }: { navigate: Navigate }) {
  const { activePlan, sessions } = useStore()

  if (!activePlan) {
    return (
      <main className="page">
        <Banner tone="info">Import a plan first and its week lays out here.</Banner>
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/import')}>Import a plan</button>
      </main>
    )
  }

  const plan = activePlan.plan
  const nextDay = nextDayFor(plan, sessions, activePlan.id)
  const todayIndex = (new Date().getDay() + 6) % 7 // JS weeks start on Sunday

  // A plan only gets a weekday grid if it actually names weekdays.
  const placed = new Map<number, PlanDay[]>()
  let anyWeekday = false
  for (const day of plan.days) {
    const index = weekdayIndex(day.weekday)
    if (index === undefined) continue
    anyWeekday = true
    placed.set(index, [...(placed.get(index) ?? []), day])
  }

  const events = (plan.events ?? [])
    .map((event) => ({ ...event, days: daysUntil(event.date) }))
    .sort((a, b) => a.days - b.days)
  const upcoming = events.filter((event) => event.days >= 0)
  const past = events.filter((event) => event.days < 0)

  const planStart = sessions
    .filter((s) => s.planId === activePlan.id)
    .map((s) => s.startedAt)
    .sort()[0] ?? activePlan.importedAt

  const dayCard = (day: PlanDay, key: string) => {
    const isRest = day.type === 'rest' || day.blocks.length === 0
    const done = completedCount(sessions, activePlan.id, day.id)
    return (
      <button
        key={key}
        type="button"
        className={`plan-day${isRest ? ' plan-day--rest' : ''}${day.id === nextDay?.id ? ' plan-day--next' : ''}`}
        disabled={isRest}
        onClick={() => navigate(`/day?d=${encodeURIComponent(day.id)}`)}
      >
        <span className="plan-day__num">{day.dayNumber}</span>
        <span className="grow">
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 19, display: 'block' }}>{day.name}</span>
          <span className="hint">
            {isRest ? 'Rest day' : `${countSets(day)} sets · ~${estimateMinutes(day)} min`}
          </span>
        </span>
        {done > 0 && <span className="pill pill--accent">×{done}</span>}
      </button>
    )
  }

  return (
    <main className="page">
      <header className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => navigate('/')}>‹</button>
        <div className="grow truncate center">
          <div className="eyebrow">{plan.planName}</div>
        </div>
        <span className="pill">{plan.days.length} days</span>
      </header>

      <h1 className="topbar__title">Schedule</h1>

      {upcoming.length > 0 && (
        <section className="stack-sm">
          <div className="eyebrow">Counting down</div>
          {upcoming.map((event) => {
            const total = Math.max(1, Math.round(
              (new Date(`${event.date}T00:00:00`).getTime() - new Date(planStart).getTime()) / 86_400_000,
            ))
            const elapsed = Math.max(0, Math.min(total, total - event.days))
            const weeks = Math.floor(event.days / 7)
            const days = event.days % 7
            return (
              <div key={`${event.name}-${event.date}`} className="card card--glow">
                <div className="row-between">
                  <span className="card__label">{event.name}</span>
                  <span className="tiny dim">
                    {new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
                  <span className="big-number" style={{ color: 'var(--amber)' }}>{event.days}</span>
                  <span className="target-strip__label">
                    {event.days === 0 ? 'today' : event.days === 1 ? 'day to go' : 'days to go'}
                  </span>
                </div>
                {event.days >= 7 && (
                  <div className="hint">{weeks} week{weeks === 1 ? '' : 's'}{days ? ` and ${days} day${days === 1 ? '' : 's'}` : ''} of training left</div>
                )}
                <div className="progress">
                  <div className="progress__fill" style={{ width: `${(elapsed / total) * 100}%` }} />
                </div>
                <div className="tiny dim">day {elapsed} of {total} since you started this plan</div>
                {event.notes && <p className="hint">{event.notes}</p>}
              </div>
            )
          })}
        </section>
      )}

      {anyWeekday ? (
        <section className="stack-sm">
          <div className="row-between">
            <div className="eyebrow">Your week</div>
            <span className="tiny dim">Today is {WEEKDAYS[todayIndex]}</span>
          </div>
          {WEEKDAYS.map((weekday, index) => {
            const days = placed.get(index) ?? []
            const isToday = index === todayIndex
            return (
              <div key={weekday} className="stack-sm">
                <div
                  className="eyebrow"
                  style={isToday ? { color: 'var(--accent)' } : undefined}
                >
                  {weekday}{isToday ? ' · today' : ''}
                </div>
                {days.length
                  ? days.map((day) => dayCard(day, `${weekday}-${day.id}`))
                  : (
                    <div className="plan-day plan-day--rest">
                      <span className="plan-day__num">–</span>
                      <span className="grow hint">Nothing scheduled</span>
                    </div>
                  )}
              </div>
            )
          })}
        </section>
      ) : (
        <section className="stack-sm">
          <div className="eyebrow">The cycle</div>
          <p className="hint">
            This plan doesn't pin days to weekdays — work through them in order and
            the app keeps your place.
          </p>
          {plan.days.map((day) => dayCard(day, day.id))}
        </section>
      )}

      {past.length > 0 && (
        <div className="card card--tight card--flat">
          <div className="card__label">Been and gone</div>
          {past.map((event) => (
            <div key={`${event.name}-${event.date}`} className="log-line">
              <span className="truncate">{event.name}</span>
              <span className="dim tiny">{Math.abs(event.days)} days ago</span>
            </div>
          ))}
        </div>
      )}

      {plan.notes && (
        <div className="card card--tight card--flat">
          <div className="card__label">Plan notes</div>
          <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{plan.notes}</p>
        </div>
      )}
    </main>
  )
}
