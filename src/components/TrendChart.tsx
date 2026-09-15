import { useRef } from 'react'

export interface TrendPoint {
  value: number
  label: string
  caption?: string
}

/**
 * A small single-series chart: one mark per session, tap or drag to read a value.
 *
 * Fill colours come from a palette validated against this app's near-black
 * surface (OKLCH lightness band, chroma floor, 3:1 contrast); the brighter
 * `stroke` is only ever used for 2px lines and small markers, where the inked
 * area is too small to glare.
 */
export default function TrendChart({
  points, kind, stroke, fill, format, height = 132, selected, onSelect,
}: {
  points: TrendPoint[]
  kind: 'line' | 'bar'
  stroke: string
  fill: string
  format: (value: number) => string
  height?: number
  selected: number | null
  onSelect: (index: number | null) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Drawn in viewBox units and scaled to the container; the aspect ratio is
  // preserved, so strokes stay even at any phone width.
  const width = 320

  if (points.length === 0) return null

  const padLeft = 6
  const padRight = 6
  const padTop = 14
  const padBottom = 20
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom

  const values = points.map((p) => p.value)
  const rawMax = Math.max(...values)
  const rawMin = Math.min(...values)
  // Bars encode magnitude by length, so they must start at zero; a line encodes
  // by position, so it can breathe inside a tighter band.
  const min = kind === 'bar' ? 0 : rawMin - (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.25
  const max = rawMax + (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.18
  const span = max - min || 1

  const x = (i: number) =>
    points.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (i / (points.length - 1)) * plotWidth
  const y = (value: number) => padTop + plotHeight - ((value - min) / span) * plotHeight

  const barSlot = plotWidth / Math.max(1, points.length)
  const barWidth = Math.max(3, Math.min(26, barSlot - 4))
  const barX = (i: number) =>
    points.length === 1 ? padLeft + plotWidth / 2 - barWidth / 2 : x(i) - barWidth / 2

  const gridValues = [min + span * 0.5, max - span * 0.02]

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((clientX - rect.left) / rect.width) * width
    const index = ((svgX - padLeft) / plotWidth) * (points.length - 1)
    onSelect(Math.max(0, Math.min(points.length - 1, Math.round(index))))
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(2)} ${padTop + plotHeight} L ${x(0).toFixed(2)} ${padTop + plotHeight} Z`

  const lastIndex = points.length - 1
  const active = selected ?? lastIndex

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`${points.length} sessions, latest ${format(points[lastIndex].value)}`}
      style={{ touchAction: 'pan-y', display: 'block' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons) pick(e.clientX) }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
    >
      {gridValues.map((value, i) => (
        <line
          key={i}
          x1={padLeft} x2={width - padRight} y1={y(value)} y2={y(value)}
          stroke="var(--line)" strokeWidth={1}
        />
      ))}

      {kind === 'line' ? (
        <>
          <path d={areaPath} fill={fill} opacity={0.22} />
          <path
            d={linePath} fill="none" stroke={stroke} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle
              key={i} cx={x(i)} cy={y(p.value)} r={i === active ? 5.5 : 3.5}
              fill={i === active ? stroke : 'var(--ink-0)'}
              stroke={stroke} strokeWidth={2}
            />
          ))}
        </>
      ) : (
        points.map((p, i) => (
          <rect
            key={i}
            x={barX(i)} y={y(p.value)}
            width={barWidth} height={Math.max(2, padTop + plotHeight - y(p.value))}
            rx={3}
            fill={i === active ? stroke : fill}
            opacity={i === active ? 1 : 0.75}
          />
        ))
      )}

      {/* Crosshair on the reading, and a direct label so the latest value is
          never something the user has to hunt for. */}
      <line
        x1={x(active)} x2={x(active)} y1={padTop - 6} y2={padTop + plotHeight}
        stroke={stroke} strokeWidth={1} opacity={0.4} strokeDasharray="2 3"
      />
      <text
        x={Math.min(width - padRight, Math.max(padLeft + 16, x(active)))}
        y={padTop - 4}
        textAnchor={active === lastIndex ? 'end' : 'middle'}
        fill="var(--text)"
        style={{ font: '600 12px var(--font-ui)' }}
      >
        {format(points[active].value)}
      </text>
      <text
        x={padLeft} y={height - 5}
        fill="var(--dim)" style={{ font: '400 11px var(--font-ui)' }}
      >
        {points[0].label}
      </text>
      <text
        x={width - padRight} y={height - 5} textAnchor="end"
        fill="var(--dim)" style={{ font: '400 11px var(--font-ui)' }}
      >
        {points[lastIndex].label}
      </text>
    </svg>
  )
}
