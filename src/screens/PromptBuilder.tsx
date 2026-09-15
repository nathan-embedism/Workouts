import { useMemo, useState } from 'react'
import type { Navigate } from '../App'
import { useStore } from '../lib/store'
import { copyText } from '../lib/hooks'
import {
  buildPrompt, CARDIO_PREFERENCES, EMPTY_FORM, EQUIPMENT_OPTIONS, EXPERIENCE_LEVELS,
  SCHEMA_SPEC, TARGET_AREAS, type BuilderForm,
} from '../lib/schema'
import { ChipGroup, Field, Toggle, useFlash } from '../components/ui'

export default function PromptBuilder({ navigate }: { navigate: Navigate }) {
  const { data, saveDraft } = useStore()
  const flash = useFlash()
  const [form, setForm] = useState<BuilderForm>(() => ({
    ...EMPTY_FORM,
    ...(data.builderDraft as Partial<BuilderForm> | undefined),
  }))
  const [showPrompt, setShowPrompt] = useState(false)

  const prompt = useMemo(() => buildPrompt(form), [form])

  const update = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => {
    const next = { ...form, [key]: value }
    setForm(next)
    saveDraft(next as unknown as Record<string, unknown>)
  }

  const toggleIn = (key: 'targetAreas' | 'equipment') => (value: string) => {
    const current = form[key]
    update(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
  }

  const copy = async (text: string, what: string) => {
    flash(await copyText(text) ? `${what} copied` : 'Copy failed — select the text and copy manually')
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="eyebrow">Step 1 of 2</div>
          <h1 className="topbar__title">Build prompt</h1>
        </div>
      </header>

      <p className="small muted">
        Describe the training you want. The app turns your answers into a prompt — including
        the exact JSON format it can read — for you to paste into any AI tool.
      </p>

      <div className="card">
        <Field label="What are you training for?" hint="e.g. build muscle, get back to running, prep for a hiking trip">
          <textarea
            className="textarea" value={form.goal} rows={3}
            onChange={(e) => update('goal', e.target.value)}
            placeholder="Put on some muscle and keep my knees happy"
          />
        </Field>

        <Field label="Experience">
          <div className="chips">
            {EXPERIENCE_LEVELS.map((level) => (
              <button
                key={level} type="button"
                className={`chip${form.experience === level ? ' chip--on' : ''}`}
                onClick={() => update('experience', level)}
              >{level}</button>
            ))}
          </div>
        </Field>

        <div className="row" style={{ gap: 12 }}>
          <Field label="Days / week">
            <input
              className="input" type="number" inputMode="numeric" min={1} max={7}
              value={form.daysPerWeek} onChange={(e) => update('daysPerWeek', e.target.value)}
            />
          </Field>
          <Field label="Minutes / session">
            <input
              className="input" type="number" inputMode="numeric" min={10} max={240} step={5}
              value={form.sessionMinutes} onChange={(e) => update('sessionMinutes', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        <Field label="Areas to target">
          <ChipGroup options={TARGET_AREAS} selected={form.targetAreas} onToggle={toggleIn('targetAreas')} />
        </Field>
      </div>

      <div className="card">
        <Field label="Equipment you have">
          <ChipGroup options={EQUIPMENT_OPTIONS} selected={form.equipment} onToggle={toggleIn('equipment')} />
        </Field>
        <Field label="Anything else in the gym" hint="Specific machines, brand names, what's usually busy">
          <input
            className="input" value={form.equipmentNotes}
            onChange={(e) => update('equipmentNotes', e.target.value)}
            placeholder="Hammer Strength row, no leg press"
          />
        </Field>
        <Field label="Cardio">
          <div className="chips">
            {CARDIO_PREFERENCES.map((option) => (
              <button
                key={option} type="button"
                className={`chip${form.cardioPreference === option ? ' chip--on' : ''}`}
                onClick={() => update('cardioPreference', option)}
              >{option}</button>
            ))}
          </div>
        </Field>
      </div>

      <div className="card">
        <Field label="Injuries or limitations">
          <textarea
            className="textarea" rows={2} value={form.limitations}
            onChange={(e) => update('limitations', e.target.value)}
            placeholder="Dodgy left shoulder — no overhead pressing"
          />
        </Field>
        <Field label="Preferences" hint="Exercises you love, exercises you refuse to do, how you like sessions structured">
          <textarea
            className="textarea" rows={2} value={form.preferences}
            onChange={(e) => update('preferences', e.target.value)}
            placeholder="Free weights over machines, hate burpees"
          />
        </Field>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12 }}>
          <Field label="Units">
            <div className="chips">
              {(['kg', 'lb'] as const).map((unit) => (
                <button
                  key={unit} type="button"
                  className={`chip${form.units === unit ? ' chip--on' : ''}`}
                  onClick={() => update('units', unit)}
                >{unit}</button>
              ))}
            </div>
          </Field>
          <Field label="Plan length (weeks)">
            <input
              className="input" type="number" inputMode="numeric" min={1} max={52}
              value={form.durationWeeks} onChange={(e) => update('durationWeeks', e.target.value)}
            />
          </Field>
        </div>

        <div className="stack-sm">
          <span className="field__label">Key dates</span>
          {form.events.map((event, i) => (
            <div key={i} className="row">
              <input
                className="input grow" value={event.name} placeholder="Marathon, comp, holiday"
                onChange={(e) => {
                  const events = [...form.events]
                  events[i] = { ...events[i], name: e.target.value }
                  update('events', events)
                }}
              />
              <input
                className="input" type="date" style={{ width: 150 }} value={event.date}
                onChange={(e) => {
                  const events = [...form.events]
                  events[i] = { ...events[i], date: e.target.value }
                  update('events', events)
                }}
              />
              <button
                type="button" className="icon-btn" aria-label="Remove key date"
                onClick={() => update('events', form.events.filter((_, idx) => idx !== i))}
              >×</button>
            </div>
          ))}
          <button
            type="button" className="btn btn--ghost btn--sm"
            onClick={() => update('events', [...form.events, { name: '', date: '' }])}
          >+ Add a date</button>
        </div>
      </div>

      <div className="card">
        <Toggle label="Allow supersets" on={form.allowSupersets} onChange={(v) => update('allowSupersets', v)} />
        <Toggle label="Allow drop sets" on={form.allowDropSets} onChange={(v) => update('allowDropSets', v)} />
        <Toggle label="Include warm-up sets" on={form.includeWarmups} onChange={(v) => update('includeWarmups', v)} />
        <Field label="Anything else for the AI">
          <textarea
            className="textarea" rows={2} value={form.extraNotes}
            onChange={(e) => update('extraNotes', e.target.value)}
            placeholder="I travel every third week — give me a hotel-gym variant"
          />
        </Field>
      </div>

      <div className="card card--glow">
        <div className="card__label">Copy it across</div>
        <p className="small muted">
          Paste this into ChatGPT, Claude, Gemini — whichever you use. Then copy its whole
          reply and bring it back to the Import tab.
        </p>
        <button className="btn btn--primary btn--block btn--xl" onClick={() => copy(prompt, 'Prompt')}>
          Copy prompt
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost btn--sm grow" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? 'Hide' : 'Preview'}
          </button>
          <button className="btn btn--ghost btn--sm grow" onClick={() => copy(SCHEMA_SPEC, 'Format spec')}>
            Copy format only
          </button>
        </div>
        {showPrompt && (
          <textarea className="textarea textarea--code" readOnly value={prompt} rows={16} />
        )}
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/import')}>
          I've got the reply — import it
        </button>
      </div>
    </main>
  )
}
