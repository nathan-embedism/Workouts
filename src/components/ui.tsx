import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'

/* ------------------------------------------------------------------- flash */

const FlashContext = createContext<(message: string) => void>(() => {})

export function FlashProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number>()

  const show = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <FlashContext.Provider value={show}>
      {children}
      {message && <div className="flash" role="status">{message}</div>}
    </FlashContext.Provider>
  )
}

export function useFlash() {
  return useContext(FlashContext)
}

/* ------------------------------------------------------------------- bits */

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function Chip({
  label, on, onClick,
}: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`chip${on ? ' chip--on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  )
}

export function ChipGroup({
  options, selected, onToggle,
}: { options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="chips">
      {options.map((option) => (
        <Chip key={option} label={option} on={selected.includes(option)} onClick={() => onToggle(option)} />
      ))}
    </div>
  )
}

export function Toggle({
  label, hint, on, onChange,
}: { label: string; hint?: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="grow">
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 18 }}>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`switch${on ? ' switch--on' : ''}`}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}

export function Banner({
  tone = 'info', children, action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'ok'
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`banner banner--${tone}`}>
      <div className="grow">{children}</div>
      {action}
    </div>
  )
}

/** Big +/- control. Long-press repeats, so 100 kg is a hold rather than 40 taps. */
export function Stepper({
  value, unit, step = 1, min = 0, max, onChange, decimals = 1, ariaLabel,
}: {
  value: number
  unit: string
  step?: number
  min?: number
  max?: number
  onChange: (next: number) => void
  decimals?: number
  ariaLabel: string
}) {
  const repeat = useRef<{ interval?: number; timeout?: number }>({})
  const valueRef = useRef(value)
  valueRef.current = value

  const apply = useCallback((delta: number) => {
    const next = Math.round((valueRef.current + delta) * 1000) / 1000
    const clamped = Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, next))
    valueRef.current = clamped
    onChange(clamped)
  }, [max, min, onChange])

  const stop = useCallback(() => {
    window.clearTimeout(repeat.current.timeout)
    window.clearInterval(repeat.current.interval)
    repeat.current = {}
  }, [])

  const start = useCallback((delta: number) => {
    apply(delta)
    repeat.current.timeout = window.setTimeout(() => {
      repeat.current.interval = window.setInterval(() => apply(delta), 90)
    }, 450)
  }, [apply])

  useEffect(() => stop, [stop])

  // While the field is being typed in, `draft` holds the raw text so partial
  // entries like "6." survive a re-render; null means "show the real value".
  const [draft, setDraft] = useState<string | null>(null)
  // Trim trailing zeros: 47.5 rather than 47.50, 60 rather than 60.00.
  const shown = draft ?? String(Number(value.toFixed(decimals)))

  const commit = () => {
    if (draft === null) return
    const parsed = Number(draft.replace(',', '.'))
    setDraft(null)
    if (draft.trim() === '' || !Number.isFinite(parsed)) return
    const clamped = Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, Math.round(parsed * 1000) / 1000))
    valueRef.current = clamped
    onChange(clamped)
  }

  return (
    <div className="stepper">
      <button
        type="button" className="stepper__btn" aria-label={`Decrease ${ariaLabel}`}
        onPointerDown={() => start(-step)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      >−</button>
      <div className="stepper__value">
        <input
          className="stepper__number"
          // "decimal" rather than "numeric" so phones show a keypad with a point.
          inputMode="decimal"
          type="text"
          enterKeyHint="done"
          aria-label={ariaLabel}
          value={shown}
          onFocus={(e) => { setDraft(shown); e.currentTarget.select() }}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,-]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <span className="stepper__unit">{unit}</span>
      </div>
      <button
        type="button" className="stepper__btn" aria-label={`Increase ${ariaLabel}`}
        onPointerDown={() => start(step)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      >+</button>
    </div>
  )
}

const RPE_COLOURS = ['#7de3ff', '#69f0c8', '#c6ff3d', '#ffb01f', '#ff2ea6']

export function RpePicker({
  value, onChange,
}: { value?: number; onChange: (next: number | undefined) => void }) {
  const options = useMemo(() => [6, 7, 8, 9, 10], [])
  return (
    <div className="rpe-grid">
      {options.map((option, i) => {
        const on = value === option
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            className={`rpe${on ? ' rpe--on' : ''}`}
            style={on ? { background: RPE_COLOURS[i] } : undefined}
            onClick={() => onChange(on ? undefined : option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
