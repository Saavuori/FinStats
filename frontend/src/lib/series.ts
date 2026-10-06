// The chart's reading of a cube, shared by the Chart and Table views so both
// always show the same thing. One dimension runs along the x-axis; every other
// dimension with several picked values splits the data into series — all
// combinations of them, never silently just the first — and dimensions with a
// single pick are what the whole chart is "of" (its caption).

import { unitOf, type Cube, type CubeCategory, type CubeDim, type Unit } from './jsonstat'

export interface Series {
  /** Stable identity: the category code from each splitting dimension. */
  key: string
  label: string
  unit: Unit
  /** Category code and label per splitting dimension (see ChartModel.splitters). */
  codes: string[]
  labels: string[]
}

export interface ChartRow {
  code: string
  label: string
  /** One value per series, in series order. */
  values: (number | null)[]
}

export interface ChartModel {
  x: CubeDim
  xIsTime: boolean
  /** Dimensions with one picked value, i.e. what the chart is about. */
  fixed: { dim: CubeDim; category: CubeCategory }[]
  /** Dimensions whose values combine into the series. */
  splitters: CubeDim[]
  series: Series[]
  rows: ChartRow[]
  /** Per-row units when the measures themselves run along the x-axis. */
  rowUnits?: Unit[]
}

/** Dimensions that can run along the x-axis: those with more than one value. */
export function axisCandidates(cube: Cube): CubeDim[] {
  return cube.dims.filter((d) => d.categories.length > 1)
}

/**
 * Lay the cube out for a chart. `xId` picks the x-axis; by default it is time
 * (when more than one period is picked), else the widest dimension — with the
 * measures last, since a value axis shared by different units means nothing.
 */
export function buildChart(cube: Cube, xId?: string): ChartModel {
  const multi = axisCandidates(cube)
  const time = cube.dims.find((d) => d.id === cube.timeDim)
  const widest = [...multi].sort(
    (a, b) =>
      Number(a.id === cube.metricDim) - Number(b.id === cube.metricDim) ||
      b.categories.length - a.categories.length,
  )[0]
  const x =
    multi.find((d) => d.id === xId) ??
    (time && time.categories.length > 1 ? time : undefined) ??
    widest ??
    time ??
    cube.dims[0]

  const splitters = multi.filter((d) => d.id !== x.id)
  const fixed = cube.dims
    .filter((d) => d.id !== x.id && d.categories.length === 1)
    .map((dim) => ({ dim, category: dim.categories[0] }))

  // Every combination of the splitting dimensions' values, in table order.
  let combos: CubeCategory[][] = [[]]
  for (const d of splitters) {
    combos = combos.flatMap((combo) => d.categories.map((cat) => [...combo, cat]))
  }

  const metricAt = splitters.findIndex((d) => d.id === cube.metricDim)
  const fixedMetric = fixed.find((f) => f.dim.id === cube.metricDim)?.category
  const series: Series[] = combos.map((cats) => ({
    key: cats.map((c) => c.code).join('|'),
    label: cats.length ? cats.map((c) => c.label).join(' · ') : (fixedMetric?.label ?? 'Value'),
    unit: unitOf(cube, metricAt >= 0 ? cats[metricAt].code : fixedMetric?.code),
    codes: cats.map((c) => c.code),
    labels: cats.map((c) => c.label),
  }))

  const seriesAt = new Map(series.map((s, i) => [s.key, i]))
  const rowAt = new Map(x.categories.map((c, i) => [c.code, i]))
  const rows: ChartRow[] = x.categories.map((c) => ({
    code: c.code,
    label: c.label,
    values: series.map(() => null),
  }))
  for (const rec of cube.records) {
    const r = rowAt.get(rec.key[x.id])
    const s = seriesAt.get(splitters.map((d) => rec.key[d.id]).join('|'))
    if (r != null && s != null) rows[r].values[s] = rec.value
  }

  return {
    x,
    xIsTime: x.id === cube.timeDim,
    fixed,
    splitters,
    series,
    rows,
    rowUnits: x.id === cube.metricDim ? x.categories.map((c) => unitOf(cube, c.code)) : undefined,
  }
}

export interface Panel {
  unit: Unit
  /** Indices into the series list. */
  members: number[]
  /** The one measure every member shows, when they share it. */
  measure?: string
}

/** What a series is called, and keyed by for its colour, within its panel. */
export interface Identity {
  key: string
  label: string
}

/**
 * Split series into panels, one per unit: values in different units never
 * share an axis. When that leaves every panel with a single measure, the
 * panel is titled by the measure and colour carries the rest — "Helsinki" is
 * the same blue in the population, age and share panels, and the legend
 * lists areas rather than every area × measure pair.
 */
export function panelize(
  model: ChartModel,
  series: Series[],
  metricDim: string | undefined,
): { panels: Panel[]; identities: Identity[] } {
  const panels: Panel[] = []
  series.forEach((s, i) => {
    const panel = panels.find((p) => p.unit.label === s.unit.label)
    if (panel) panel.members.push(i)
    else panels.push({ unit: s.unit, members: [i] })
  })

  const m = model.splitters.findIndex((d) => d.id === metricDim)
  const byMeasure =
    panels.length > 1 &&
    m >= 0 &&
    panels.every((p) => new Set(p.members.map((i) => series[i].codes[m])).size === 1)
  if (!byMeasure) {
    return { panels, identities: series.map((s) => ({ key: s.key, label: s.label })) }
  }

  for (const p of panels) p.measure = series[p.members[0]].labels[m]
  const without = (xs: string[]) => xs.filter((_, j) => j !== m)
  return {
    panels,
    identities: series.map((s) => ({
      key: without(s.codes).join('|'),
      label: without(s.labels).join(' · ') || s.labels[m],
    })),
  }
}

/**
 * Colour slots that follow the series, not its position: a series keeps the
 * slot it had (`prev`), and a new one takes the lowest free slot. Removing a
 * series therefore never repaints the survivors. `keys` must not outnumber
 * `size`.
 */
export function assignSlots(
  prev: ReadonlyMap<string, number>,
  keys: string[],
  size: number,
): Map<string, number> {
  const next = new Map<string, number>()
  for (const k of keys) {
    const slot = prev.get(k)
    if (slot != null && slot < size) next.set(k, slot)
  }
  const used = new Set(next.values())
  let free = 0
  for (const k of keys) {
    if (next.has(k)) continue
    while (used.has(free)) free++
    next.set(k, free)
    used.add(free)
  }
  return next
}
