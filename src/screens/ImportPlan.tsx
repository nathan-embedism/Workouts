import { useState } from 'react'
import type { Navigate } from '../App'
import { useStore } from '../lib/store'
import { parseAndValidate, type ValidationResult } from '../lib/validate'
import { DEMO_PLAN } from '../lib/demoPlan'
import { countSets } from '../lib/steps'
import { Banner, useFlash } from '../components/ui'

export default function ImportPlan({ navigate }: { navigate: Navigate }) {
  const { importPlan, plans, activePlan, setActivePlan, removePlan } = useStore()
  const flash = useFlash()
  const [raw, setRaw] = useState('')
  const [result, setResult] = useState<ValidationResult | null>(null)

  const check = (text: string) => {
    setRaw(text)
    setResult(text.trim() ? parseAndValidate(text) : null)
  }

  const useThisPlan = () => {
    if (!result?.plan) return
    importPlan(result.plan)
    flash(`${result.plan.planName} imported`)
    setRaw('')
    setResult(null)
    navigate('/')
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="eyebrow">Step 2 of 2</div>
          <h1 className="topbar__title">Import plan</h1>
        </div>
      </header>

      <p className="small muted">
        Paste your AI tool's reply below. Anything wrapped around the JSON is ignored,
        and you'll see exactly what's missing if the format is off.
      </p>

      <textarea
        className="textarea textarea--code"
        rows={10}
        value={raw}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={'{\n  "schemaVersion": 1,\n  "planName": "…",\n  …\n}'}
        onChange={(e) => check(e.target.value)}
      />

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--ghost btn--sm grow" onClick={() => check('')}>Clear</button>
        <label className="btn btn--ghost btn--sm grow" style={{ position: 'relative', overflow: 'hidden' }}>
          Open file
          <input
            type="file"
            accept="application/json,.json,.txt"
            style={{ position: 'absolute', inset: 0, opacity: 0 }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              check(await file.text())
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {result && !result.ok && (
        <Banner tone="error">
          <strong>Can't read that plan</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
            {result.errors.slice(0, 8).map((error, i) => <li key={i}>{error}</li>)}
          </ul>
          {result.errors.length > 8 && <p className="hint">…and {result.errors.length - 8} more.</p>}
        </Banner>
      )}

      {result?.warnings.length ? (
        <Banner tone="warn">
          <strong>Fixed up on the way in</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
            {result.warnings.slice(0, 6).map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
          {result.warnings.length > 6 && <p className="hint">…and {result.warnings.length - 6} more.</p>}
        </Banner>
      ) : null}

      {result?.ok && result.plan && (
        <div className="card card--glow">
          <div className="card__label">Looks good</div>
          <div className="exercise-name" style={{ fontSize: 'clamp(2rem, 9vw, 2.8rem)' }}>{result.plan.planName}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="pill pill--accent">{result.plan.days.length} days</span>
            <span className="pill">{result.plan.units}</span>
            {result.plan.durationWeeks && <span className="pill">{result.plan.durationWeeks} weeks</span>}
            {result.plan.events?.length ? <span className="pill pill--warm">{result.plan.events.length} key dates</span> : null}
          </div>
          <div className="stack-sm">
            {result.plan.days.map((day) => (
              <div key={day.id} className="log-line">
                <span className="truncate">{day.dayNumber}. {day.name}</span>
                <span className="dim tiny">
                  {day.type === 'rest' || !day.blocks.length ? 'rest' : `${countSets(day)} sets`}
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn--primary btn--block btn--xl" onClick={useThisPlan}>
            Use this plan
          </button>
        </div>
      )}

      {!raw && (
        <div className="card card--tight card--flat">
          <div className="card__label">Just looking?</div>
          <p className="small muted">Load a small demo plan to see how the runner works.</p>
          <button
            className="btn btn--ghost btn--block"
            onClick={() => check(JSON.stringify(DEMO_PLAN, null, 2))}
          >
            Load demo plan
          </button>
        </div>
      )}

      {plans.length > 0 && (
        <section className="stack-sm">
          <div className="eyebrow">Saved plans</div>
          {plans.map((stored) => (
            <div key={stored.id} className="plan-day">
              <span className="grow truncate">
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 18, display: 'block' }}>
                  {stored.plan.planName}
                </span>
                <span className="hint">{new Date(stored.importedAt).toLocaleDateString()}</span>
              </span>
              {stored.id === activePlan?.id
                ? <span className="pill pill--accent">Active</span>
                : (
                  <button className="btn btn--sm btn--ghost" onClick={() => { setActivePlan(stored.id); flash('Plan switched') }}>
                    Use
                  </button>
                )}
              <button
                className="icon-btn" aria-label={`Delete ${stored.plan.planName}`}
                onClick={() => {
                  if (window.confirm(`Delete "${stored.plan.planName}"? Logged workouts are kept.`)) removePlan(stored.id)
                }}
              >🗑</button>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
