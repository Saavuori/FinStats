import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { LineChart as LineIcon, BarChart3 } from 'lucide-react'
import type { Cube } from '../lib/jsonstat'
import { seriesColor } from '../lib/palette'

interface Props {
  cube: Cube
}

/**
 * Line/bar chart of the cube. The x-axis is the time dimension when there is
 * one (otherwise the dimension with the most categories); the series splitter
 * is any other multi-value dimension, chosen from a dropdown. Every remaining
 * dimension is pinned to its first selected value.
 */
function ChartView({ cube }: Props) {
  const [kind, setKind] = useState<'line' | 'bar'>('line')

  // Candidate x-axis: prefer time, else the widest dimension.
  const xDim =
    cube.dims.find((d) => d.id === cube.timeDim) ??
    [...cube.dims].sort((a, b) => b.categories.length - a.categories.length)[0]

  // Dimensions that can split into series: anything else with >1 category.
  const seriesCandidates = cube.dims.filter(
    (d) => d.id !== xDim.id && d.categories.length > 1,
  )
  const defaultSeries =
    seriesCandidates.find((d) => d.id === cube.metricDim) ?? seriesCandidates[0]
  const [seriesId, setSeriesId] = useState(defaultSeries?.id ?? '')
  const seriesDim = cube.dims.find((d) => d.id === seriesId) ?? defaultSeries

  // Pin every other dimension to its first category.
  const pinned = useMemo(() => {
    const p: Record<string, string> = {}
    for (const d of cube.dims) {
      if (d.id === xDim.id || d.id === seriesDim?.id) continue
      p[d.id] = d.categories[0]?.code
    }
    return p
  }, [cube, xDim, seriesDim])

  const seriesCats = seriesDim ? seriesDim.categories : [{ code: '_v', label: cube.unit || 'Value' }]

  // Recharts rows: one per x category, a column per series.
  const data = useMemo(() => {
    const index = new Map<string, Record<string, string | number | null>>()
    for (const cat of xDim.categories) index.set(cat.code, { x: cat.label })
    for (const rec of cube.records) {
      // Skip records that don't match the pinned selection.
      const matchPinned = Object.entries(pinned).every(([k, v]) => rec.key[k] === v)
      if (!matchPinned) continue
      const row = index.get(rec.key[xDim.id])
      if (!row) continue
      const sCode = seriesDim ? rec.key[seriesDim.id] : '_v'
      row[sCode] = rec.value
    }
    return [...index.values()]
  }, [cube, xDim, seriesDim, pinned])

  const numberFmt = (v: number) => new Intl.NumberFormat('en-US').format(v)

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        {seriesCandidates.length > 0 && (
          <label className="mini-select">
            Series
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {seriesCandidates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="seg">
          <button className={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')}>
            <LineIcon size={15} /> Line
          </button>
          <button className={kind === 'bar' ? 'on' : ''} onClick={() => setKind('bar')}>
            <BarChart3 size={15} /> Bar
          </button>
        </div>
      </div>

      {cube.unit && <div className="chart-unit">Unit: {cube.unit}</div>}

      <ResponsiveContainer width="100%" height={420}>
        {kind === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
            <XAxis dataKey="x" stroke="var(--axis)" tick={{ fontSize: 12, fill: 'var(--muted)' }} minTickGap={24} />
            <YAxis stroke="var(--axis)" tick={{ fontSize: 12, fill: 'var(--muted)' }} tickFormatter={numberFmt} width={72} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => numberFmt(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {seriesCats.map((s, i) => (
              <Line
                key={s.code}
                type="monotone"
                dataKey={s.code}
                name={s.label}
                stroke={seriesColor(i)}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="x" stroke="var(--axis)" tick={{ fontSize: 12, fill: 'var(--muted)' }} minTickGap={12} />
            <YAxis stroke="var(--axis)" tick={{ fontSize: 12, fill: 'var(--muted)' }} tickFormatter={numberFmt} width={72} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => numberFmt(Number(v))} cursor={{ fill: 'var(--surface-2)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {seriesCats.map((s, i) => (
              <Bar key={s.code} dataKey={s.code} name={s.label} fill={seriesColor(i)} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
}

export default ChartView
