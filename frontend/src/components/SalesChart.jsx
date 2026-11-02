import { useEffect, useRef, useState } from 'react'
import { compact, fmtDate, money } from '../format'

const nice = (max) => {
  // Four even steps with round values above the maximum.
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  return { step, top: step * 4 }
}

/** Daily sales as bars. This month in the one chart hue, earlier days in grey. */
export default function SalesChart({ days, monthStart, onHover }) {
  const wrap = useRef(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  const H = 250
  const L = 46
  const B = 24
  const T = 8
  const R = 2
  const max = Math.max(...days.map((d) => d.amount), 1)
  const { step, top } = nice(max)
  const slot = (w - L - R) / days.length
  const bar = Math.max(3, slot * 0.68)
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)

  const idx = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - r.left - L) / slot)))
  }
  const labelAt = [0, Math.floor(days.length / 2), days.length - 1]

  return (
    <div ref={wrap} className="chart">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`Daily sales for the last ${days.length} days. Highest day ${money(max)}.`}
        onMouseMove={(e) => (setHover(idx(e)), onHover?.(days[idx(e)]))}
        onMouseLeave={() => (setHover(null), onHover?.(null))}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">
              {t === 0 ? '₹0' : compact(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const isMonth = d.date >= monthStart
          const h = (H - T - B) * (d.amount / top)
          return (
            <rect
              key={d.date}
              x={L + i * slot + (slot - bar) / 2}
              y={y(d.amount)}
              width={bar}
              height={Math.max(d.amount ? 1 : 0, h)}
              className={(isMonth ? 'bar-now' : 'bar-before') + (hover === i ? ' hot' : '')}
            >
              <title>{`${fmtDate(d.date)}: ${money(d.amount)}`}</title>
            </rect>
          )
        })}
        {labelAt.map((i) => (
          <text key={i} x={L + i * slot + slot / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} className="tick">
            {fmtDate(days[i].date)}
          </text>
        ))}
      </svg>
    </div>
  )
}
