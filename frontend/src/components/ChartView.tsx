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
  ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts'
import { LineChart as LineIcon, BarChart3, ArrowDownWideNarrow } from 'lucide-react'
import { formatValue, unitSuffix, type Cube, type Unit } from '../lib/jsonstat'
import { assignSlots, axisCandidates, buildChart, panelize } from '../lib/series'
import { MAX_SERIES, seriesColor } from '../lib/palette'
import type { Theme } from '../lib/theme'
import type { ChartKind } from '../lib/urlstate'
import Caption from './Caption'

interface Props {
  cube: Cube
  theme: Theme
  /** Chart form and x-axis; unset means "choose from the data". */
  kind?: ChartKind
  xId?: string
  onKind: (kind: ChartKind) => void
  onX: (dimId: string) => void
}

/** Recharts row: the x label plus one `s<i>` column per drawn series. */
type Row = Record<string, string | number | null>

/**
 * Line or bar chart of the cube. Time runs along the x-axis by default; every
 * other dimension with several picked values splits the series. Series with
 * different units never share an axis — each unit gets its own panel.
 */
function ChartView({ cube, theme, kind, xId, onKind, onX }: Props) {
  const model = useMemo(() => buildChart(cube, xId), [cube, xId])
  const axes = axisCandidates(cube)
  const form: ChartKind = kind ?? (model.xIsTime ? 'line' : 'bar')
  // Categories without an order (areas, products) read best as horizontal
  // bars, which can also be ranked.
  const horizontal = form === 'bar' && !model.xIsTime
  const [ranked, setRanked] = useState(false)

  const shown = model.series.slice(0, MAX_SERIES)
  const { panels, identities } = panelize(model, shown, cube.metricDim)
  // One legend entry per identity, in first-seen order.
  const legend = identities.filter((id, i) => identities.findIndex((o) => o.key === id.key) === i)

  // Colour slots remember the previous render's, so a series keeps its colour
  // when others come and go (React's "adjust state on prop change" pattern).
  const keys = legend.map((id) => id.key).join('\n')
  const [slotState, setSlotState] = useState(() => ({
    keys,
    slots: assignSlots(new Map(), legend.map((id) => id.key), MAX_SERIES),
  }))
  if (slotState.keys !== keys) {
    setSlotState({ keys, slots: assignSlots(slotState.slots, legend.map((id) => id.key), MAX_SERIES) })
  }
  const colorOf = (key: string) => seriesColor(slotState.slots.get(key) ?? 0, theme)

  const data = useMemo(() => {
    const rows = ranked && horizontal
      ? [...model.rows].sort((a, b) => (b.values[0] ?? -Infinity) - (a.values[0] ?? -Infinity))
      : model.rows
    const drawn = Math.min(model.series.length, MAX_SERIES)
    return rows.map((r) => {
      const row: Row = { x: r.label }
      for (let i = 0; i < drawn; i++) row[`s${i}`] = r.values[i]
      return row
    })
  }, [model, ranked, horizontal])

  // Measures along the x-axis put different units on one value axis.
  const mixedAlongX = model.rowUnits && new Set(model.rowUnits.map((u) => u.label)).size > 1

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        {axes.length > 1 && (
          <label className="mini-select">
            {horizontal ? 'Bars' : 'X axis'}
            <select value={model.x.id} onChange={(e) => onX(e.target.value)}>
              {axes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {horizontal && (
          <button
            className={`toggle ${ranked ? 'on' : ''}`}
            aria-pressed={ranked}
            onClick={() => setRanked((r) => !r)}
          >
            <ArrowDownWideNarrow size={15} /> Rank
          </button>
        )}
        <div className="seg">
          <button className={form === 'line' ? 'on' : ''} aria-pressed={form === 'line'} onClick={() => onKind('line')}>
            <LineIcon size={15} /> Line
          </button>
          <button className={form === 'bar' ? 'on' : ''} aria-pressed={form === 'bar'} onClick={() => onKind('bar')}>
            <BarChart3 size={15} /> Bar
          </button>
        </div>
      </div>

      <Caption fixed={model.fixed} />

      {model.series.length > MAX_SERIES && (
        <p className="note">
          Showing the first {MAX_SERIES} of {model.series.length} series. Narrow a dimension, or open
          the Table view to see them all.
        </p>
      )}

      {legend.length > 1 && (
        <ul className="legend-list">
          {legend.map((id) => (
            <li key={id.key}>
              <span className={form === 'line' ? 'key-line' : 'key-box'} style={{ background: colorOf(id.key) }} />
              {id.label}
            </li>
          ))}
        </ul>
      )}

      {mixedAlongX ? (
        <p className="note">
          These measures have different units, so they can't share a value axis. Pick one measure,
          or compare them in the Table view.
        </p>
      ) : (
        panels.map(({ unit, members, measure }) => (
          <Panel
            key={unit.label}
            data={data}
            title={measure}
            series={members.map((i) => ({
              index: i,
              name: identities[i].label,
              color: colorOf(identities[i].key),
            }))}
            unit={model.rowUnits?.[0] ?? unit}
            form={form}
            horizontal={horizontal}
            rowCount={data.length}
            compact={panels.length > 1}
          />
        ))
      )}
    </div>
  )
}

interface PanelProps {
  data: Row[]
  /** The panel's measure, when it holds just one. */
  title?: string
  series: { index: number; name: string; color: string }[]
  unit: Unit
  form: ChartKind
  horizontal: boolean
  rowCount: number
  /** Several unit panels stacked: keep each one shorter. */
  compact: boolean
}

const tick = { fontSize: 12, fill: 'var(--muted)' }
const tickNumber = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)

function Panel({ data, title, series, unit, form, horizontal, rowCount, compact }: PanelProps) {
  const suffix = unitSuffix(unit).trim()
  const tooltip = (props: TooltipContentProps) => <ChartTooltip {...props} unit={unit} />
  // The unit, unless the measure's own name already says it ("Share…, %").
  const head = (
    <div className="chart-unit">
      {title && <span className="panel-title">{title}</span>}
      {suffix && !title?.includes(suffix) && <span>{suffix}</span>}
    </div>
  )

  if (horizontal) {
    // One band per category, sized so bars stay at most 24px thick.
    const height = Math.max(240, rowCount * (series.length * 12 + 12) + 40)
    return (
      <div className="panel-chart">
        {head}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" barGap={2} margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" horizontal={false} />
            {/* On top: a ranking can run hundreds of bars down the page. */}
            <XAxis type="number" orientation="top" stroke="var(--axis)" tick={tick} tickFormatter={tickNumber} />
            <YAxis type="category" dataKey="x" stroke="var(--axis)" tick={tick} width={170} interval={0} />
            <Tooltip content={tooltip} cursor={{ fill: 'var(--surface-2)' }} />
            {series.map(({ index, name, color }) => (
              <Bar key={index} dataKey={`s${index}`} name={name} fill={color} maxBarSize={24} radius={[0, 4, 4, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const height = compact ? 260 : 400
  return (
    <div className="panel-chart">
      {head}
      <ResponsiveContainer width="100%" height={height}>
        {form === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="x" stroke="var(--axis)" tick={tick} minTickGap={24} />
            {/* A trend reads against its own range; a zero baseline flattens it. */}
            <YAxis stroke="var(--axis)" tick={tick} tickFormatter={tickNumber} width={72} domain={['auto', 'auto']} />
            <Tooltip content={tooltip} cursor={{ stroke: 'var(--axis)' }} />
            {series.map(({ index, name, color }) => (
              <Line
                key={index}
                type="monotone"
                dataKey={`s${index}`}
                name={name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} barGap={2} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="x" stroke="var(--axis)" tick={tick} minTickGap={12} />
            <YAxis stroke="var(--axis)" tick={tick} tickFormatter={tickNumber} width={72} />
            <Tooltip content={tooltip} cursor={{ fill: 'var(--surface-2)' }} />
            {series.map(({ index, name, color }) => (
              <Bar key={index} dataKey={`s${index}`} name={name} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

/** Every series at the hovered position: value first, then whose it is. */
function ChartTooltip({ active, payload, label, unit }: TooltipContentProps & { unit: Unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip">
      <div className="tip-x">{label}</div>
      {payload.map((p) => (
        <div className="tip-row" key={String(p.dataKey)}>
          <span className="key-line" style={{ background: p.color }} />
          <strong>
            {formatValue(typeof p.value === 'number' ? p.value : null, unit)}
            {unitSuffix(unit)}
          </strong>
          {payload.length > 1 && <span className="tip-name">{p.name}</span>}
        </div>
      ))}
    </div>
  )
}

export default ChartView
