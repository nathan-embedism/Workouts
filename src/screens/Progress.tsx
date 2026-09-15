import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { buildExerciseSeries, personalBest, trendOf, type ExercisePoint } from '../lib/progress'
import { durationWords, roundLoad, shortDate } from '../lib/format'
import TrendChart, { type TrendPoint } from '../components/TrendChart'
import { Banner } from '../components/ui'

/** Brand neon for strokes and markers; the darker, validated tone for filled area. */
const INK = {
  load: { stroke: '#21e6ff', fill: '#1090a1' },
  volume: { stroke: '#c6ff3d', fill: '#72951f' },
  time: { stroke: '#ffb01f', fill: '#aa7411' },
  rpe: { stroke: '#ff2ea6', fill: '#dc268e' },
}

export default function Progress() {
  const { sessions, settings } = useStore()
  const series = useMemo(() => buildExerciseSeries(sessions, settings.units), [sessions, settings.units])
  const [key, setKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const chosen = series.find((s) => s.key === key) ?? series[0]

  if (!series.length) {
    return (
      <Banner tone="info">
        Nothing to plot yet. Finish a couple of workouts and your progress on each
        exercise shows up here.
      </Banner>
    )
  }

  if (!chosen) return null

  const points = chosen.points
  const index = selected ?? points.length - 1
  const current = points[index]
  const label = (point: ExercisePoint) => shortDate(point.date)

  const charts: {
    title: string
    unit: string
    kind: 'line' | 'bar'
    ink: { stroke: string; fill: string }
    data: TrendPoint[]
    format: (value: number) => string
  }[] = []

  const pointsFor = (pick: (p: ExercisePoint) => number | undefined): TrendPoint[] =>
    points.filter((p) => pick(p) !== undefined).map((p) => ({ value: pick(p)!, label: label(p) }))

  if (chosen.hasWeight) {
    charts.push({
      title: 'Heaviest set', unit: settings.units, kind: 'line', ink: INK.load,
      data: pointsFor((p) => p.topWeight),
      format: (v) => `${roundLoad(v)} ${settings.units}`,
    })
    charts.push({
      title: 'Volume per session', unit: settings.units, kind: 'bar', ink: INK.volume,
      data: pointsFor((p) => p.volume),
      format: (v) => `${Math.round(v).toLocaleString()} ${settings.units}`,
    })
  } else if (chosen.hasReps) {
    charts.push({
      title: 'Total reps', unit: 'reps', kind: 'bar', ink: INK.volume,
      data: pointsFor((p) => p.totalReps),
      format: (v) => `${Math.round(v)} reps`,
    })
  }

  if (chosen.hasDuration) {
    charts.push({
      title: 'Time under load', unit: 'duration', kind: 'bar', ink: INK.time,
      data: pointsFor((p) => p.totalSeconds),
      format: (v) => durationWords(v),
    })
  }

  if (points.some((p) => p.avgRpe !== undefined)) {
    charts.push({
      title: 'Average RPE', unit: 'RPE', kind: 'line', ink: INK.rpe,
      data: pointsFor((p) => p.avgRpe),
      format: (v) => `RPE ${Math.round(v * 10) / 10}`,
    })
  }

  const best = personalBest(chosen)
  const loadTrend = trendOf(points.map((p) => p.topWeight))
  const volumeTrend = trendOf(points.map((p) => p.volume))

  return (
    <div className="stack">
      <label className="field">
        <span className="field__label">Exercise</span>
        <select
          className="select"
          value={chosen.key}
          onChange={(e) => { setKey(e.target.value); setSelected(null) }}
        >
          {series.map((item) => (
            <option key={item.key} value={item.key}>
              {item.name} ({item.points.length})
            </option>
          ))}
        </select>
      </label>

      {points.length < 2 && (
        <Banner tone="info">
          Only one session logged for {chosen.name} so far — the shape of the trend
          appears once you've done it again.
        </Banner>
      )}

      <div className="card card--tight">
        <div className="row wrap" style={{ gap: 20 }}>
          {best?.topWeight !== undefined && (
            <div className="target-strip__item">
              <span className="big-number" style={{ color: INK.load.stroke, fontSize: 42 }}>
                {roundLoad(best.topWeight)}
              </span>
              <span className="target-strip__label">Best set ({settings.units})</span>
            </div>
          )}
          {loadTrend && (
            <div className="target-strip__item">
              <span
                className="big-number"
                style={{ color: loadTrend.percent >= 0 ? INK.volume.stroke : 'var(--danger)', fontSize: 42 }}
              >
                {loadTrend.percent > 0 ? '+' : ''}{loadTrend.percent}%
              </span>
              <span className="target-strip__label">Load since first</span>
            </div>
          )}
          {!loadTrend && volumeTrend && (
            <div className="target-strip__item">
              <span
                className="big-number"
                style={{ color: volumeTrend.percent >= 0 ? INK.volume.stroke : 'var(--danger)', fontSize: 42 }}
              >
                {volumeTrend.percent > 0 ? '+' : ''}{volumeTrend.percent}%
              </span>
              <span className="target-strip__label">Volume since first</span>
            </div>
          )}
        </div>
        <p className="hint">
          {points.length} session{points.length === 1 ? '' : 's'} · warm-up sets excluded
        </p>
      </div>

      <div className="card card--tight card--flat">
        <div className="row-between">
          <span className="card__label">{shortDate(current.date)}</span>
          <span className="tiny dim">{current.sets} set{current.sets === 1 ? '' : 's'}</span>
        </div>
        <div className="hint">
          {[
            current.topWeight !== undefined ? `top ${roundLoad(current.topWeight)} ${settings.units}` : null,
            current.volume !== undefined ? `${Math.round(current.volume).toLocaleString()} ${settings.units} volume` : null,
            current.totalReps !== undefined ? `${current.totalReps} reps` : null,
            current.totalSeconds !== undefined ? durationWords(current.totalSeconds) : null,
            current.totalDistance !== undefined ? `${current.totalDistance}${current.distanceUnit ?? ''}` : null,
            current.avgRpe !== undefined ? `RPE ${current.avgRpe}` : null,
          ].filter(Boolean).join(' · ') || 'No numbers recorded for this session.'}
        </div>
      </div>

      {charts.map((chart) => (
        <div key={chart.title} className="card card--tight">
          <div className="row-between">
            <span className="card__label" style={{ color: chart.ink.stroke }}>{chart.title}</span>
            <span className="tiny dim">{chart.unit}</span>
          </div>
          <TrendChart
            points={chart.data}
            kind={chart.kind}
            stroke={chart.ink.stroke}
            fill={chart.ink.fill}
            format={chart.format}
            selected={Math.min(index, chart.data.length - 1)}
            onSelect={setSelected}
          />
        </div>
      ))}

      <button className="btn btn--ghost btn--block btn--sm" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Hide the numbers' : 'Show the numbers'}
      </button>

      {showTable && (
        <div className="card card--tight card--flat">
          {points.map((point, i) => (
            <button
              key={point.sessionId}
              type="button"
              className="log-line"
              style={{ width: '100%', textAlign: 'left', color: i === index ? 'var(--text)' : undefined }}
              onClick={() => setSelected(i)}
            >
              <span className="dim tiny" style={{ width: 62, flex: 'none' }}>{shortDate(point.date)}</span>
              <span className="grow">
                {[
                  point.topWeight !== undefined ? `${roundLoad(point.topWeight)} ${settings.units}` : null,
                  point.totalReps !== undefined ? `${point.totalReps} reps` : null,
                  point.totalSeconds !== undefined ? durationWords(point.totalSeconds) : null,
                ].filter(Boolean).join(' · ')}
              </span>
              {point.avgRpe !== undefined && <span className="dim tiny">RPE {point.avgRpe}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
