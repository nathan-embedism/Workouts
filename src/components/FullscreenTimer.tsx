import { useEffect, useRef, useState, type ReactNode } from 'react'
import { beep, vibrate } from '../lib/hooks'
import { clockTime } from '../lib/format'
import { useStore } from '../lib/store'

/**
 * The big portrait timer. Time is derived from a wall-clock end stamp, so a
 * backgrounded tab (where intervals get throttled) still reads correctly, and
 * it keeps counting into overtime rather than silently ending the rest.
 */
export default function FullscreenTimer({
  seconds, label, sublabel, accent = 'var(--cyan)', onFinish, finishLabel, children, onSkip,
}: {
  seconds: number
  label: string
  sublabel?: string
  accent?: string
  onFinish: () => void
  finishLabel: string
  children?: ReactNode
  onSkip?: () => void
}) {
  const { settings } = useStore()
  const [endsAt, setEndsAt] = useState(() => Date.now() + seconds * 1000)
  const [remaining, setRemaining] = useState(seconds)
  const expiredRef = useRef(false)
  const countdownRef = useRef(-1)

  useEffect(() => {
    setEndsAt(Date.now() + seconds * 1000)
    setRemaining(seconds)
    expiredRef.current = false
    countdownRef.current = -1
  }, [seconds])

  useEffect(() => {
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000
      setRemaining(left)

      // Three short pips, then a longer one on zero.
      const whole = Math.ceil(left)
      if (left > 0 && whole <= 3 && whole !== countdownRef.current) {
        countdownRef.current = whole
        if (settings.sound) beep(660, 90, 0.16)
      }
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true
        if (settings.sound) beep(1040, 420, 0.28)
        if (settings.vibrate) vibrate([180, 90, 180])
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [endsAt, settings.sound, settings.vibrate])

  const overtime = remaining <= 0
  const shown = overtime ? `+${clockTime(-remaining)}` : clockTime(remaining)
  const progress = seconds > 0 ? Math.min(1, Math.max(0, remaining / seconds)) : 0
  const colour = overtime ? 'var(--magenta)' : accent

  const adjust = (delta: number) => {
    expiredRef.current = false
    countdownRef.current = -1
    setEndsAt((prev) => Math.max(Date.now(), prev + delta * 1000))
  }

  const size = 320
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="stack" style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
      <div className="center stack-sm">
        <div className="eyebrow" style={{ color: colour }}>{label}</div>
        {sublabel && <div className="muted small">{sublabel}</div>}
      </div>

      <div
        className="timer-ring"
        style={{ height: 'min(38dvh, 76vw)', aspectRatio: '1 / 1', margin: '0 auto' }}
      >
        <svg className="timer-ring__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="var(--ink-3)" strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={colour} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.2s linear', filter: `drop-shadow(0 0 10px ${colour})` }}
          />
        </svg>
        <div
          className="timer-digits"
          style={{ color: colour, '--accent': colour } as React.CSSProperties}
          role="timer"
          aria-live="off"
        >
          {shown}
        </div>
      </div>

      <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
        <button className="btn btn--ghost" onClick={() => adjust(-15)}>−15s</button>
        <button className="btn btn--ghost" onClick={() => adjust(15)}>+15s</button>
        {onSkip && <button className="btn btn--quiet" onClick={onSkip}>Skip</button>}
      </div>

      {children}

      <div className="sticky-actions">
        <button
          className={`btn btn--block btn--xl ${overtime ? 'btn--hot' : 'btn--primary'}`}
          onClick={onFinish}
        >
          {finishLabel}
        </button>
      </div>
    </div>
  )
}
