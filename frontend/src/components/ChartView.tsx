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
import { unitOf, type Cube, type CubeCategory } from '../lib/jsonstat'
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
  const xDim = useMemo(
    () =>
      cube.dims.find((d) => d.id === cube.timeDim) ??
      [...cube.dims].sort((a, b) => b.categories.length - a.categories.length)[0],
    [cube],
  )

  // Dimensions that can split into series: anything else with >1 category.
  const seriesCandidates = useMemo(
    () => cube.dims.filter((d) => d.id !== xDim.id && d.categories.length > 1),
    [cube, xDim],
  )
  const defaultSeries =
    seriesCandidates.find((d) => d.id === cube.metricDim) ?? seriesCandidates[0]
  // The pick survives a requery only while that dimension can still split
  // series (it may now have one value, or have become the x-axis).
  const [seriesId, setSeriesId] = useState(defaultSeries?.id ?? '')
  const seriesDim = seriesCandidates.find((d) => d.id === seriesId) ?? defaultSeries

  // Pin every other dimension to its first category.
  const pinned = useMemo(() => {
    const p: Record<string, string> = {}
    for (const d of cube.dims) {
      if (d.id === xDim.id || d.id === seriesDim?.id) continue
      p[d.id] = d.categories[0]?.code
    }
    return p
  }, [cube, xDim, seriesDim])

  // Units of the measures on screen: the pinned one, or every measure when
  // the measure dimension is the x-axis or the series. One shared unit goes
  // above the chart; mixed units ("index point" and "per cent") are named on
  // each series or x category instead, so none is mislabelled.
  const { sharedUnit, labelOf } = useMemo(() => {
    const metric = cube.dims.find((d) => d.id === cube.metricDim)
    const shown = !metric
      ? []
      : metric.id in pinned
        ? [pinned[metric.id]]
        : metric.categories.map((c) => c.code)
    const bases = new Set(shown.map((m) => unitOf(cube, m)?.base).filter(Boolean))
    const mixed = bases.size > 1
    return {
      sharedUnit: bases.size === 1 ? [...bases][0]! : '',
      labelOf: (dimId: string, cat: CubeCategory) => {
        const base = mixed && dimId === metric?.id ? unitOf(cube, cat.code)?.base : ''
        return base ? `${cat.label} (${base})` : cat.label
      },
    }
  }, [cube, pinned])

  const seriesCats = seriesDim
    ? seriesDim.categories.map((c) => ({ code: c.code, label: labelOf(seriesDim.id, c) }))
    : [{ code: '_v', label: sharedUnit || 'Value' }]

  // Recharts rows: one per x category, a column per series.
  const data = useMemo(() => {
    const index = new Map<string, Record<string, string | number | null>>()
    for (const cat of xDim.categories) index.set(cat.code, { x: labelOf(xDim.id, cat) })
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
  }, [cube, xDim, seriesDim, pinned, labelOf])

  const numberFmt = (v: number) => new Intl.NumberFormat('en-US').format(v)

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        {seriesCandidates.length > 0 && (
          <label className="mini-select">
            Series
            <select value={seriesDim?.id} onChange={(e) => setSeriesId(e.target.value)}>
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

      {sharedUnit && <div className="chart-unit">Unit: {sharedUnit}</div>}

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
