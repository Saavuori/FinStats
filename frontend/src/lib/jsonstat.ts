// Minimal JSON-stat v2 reader, tailored to what the UI needs.
//
// A json-stat2 "dataset" stores every observation in a single flat `value`
// array, indexed row-major over the dimensions listed in `id` (the last
// dimension varies fastest). Each dimension carries a category index (code ->
// position) and labels. We unfold that into tidy records the chart and map can
// slice independently. Spec: https://json-stat.org/full/

import { looksLikeRegion, looksLikeTime } from './pxweb'

export interface CubeCategory {
  code: string
  label: string
}

export type DimRole = 'time' | 'metric' | 'geo' | 'other'

export interface CubeDim {
  id: string
  label: string
  categories: CubeCategory[]
  role: DimRole
}

export interface CubeRecord {
  /** dimension id -> selected category code for this observation */
  key: Record<string, string>
  value: number | null
}

/** A measure's unit: its label ("number", "%", "EUR/m2") and decimal places. */
export interface Unit {
  label: string
  decimals?: number
}

export interface Cube {
  label: string
  /** The table's listing title, "11ra -- Key figures on population by region, 1990-2025". */
  description: string
  source: string
  updated: string
  /** Unit of each measure, keyed by its category code in the metric dimension. */
  units: Record<string, Unit>
  dims: CubeDim[]
  records: CubeRecord[]
  timeDim?: string
  geoDim?: string
  metricDim?: string
}

const NO_UNIT: Unit = { label: '' }

/**
 * The unit of an observation whose measure is `metricCode`. Tables without a
 * metric dimension have no unit at all.
 */
export function unitOf(cube: Cube, metricCode: string | undefined): Unit {
  return (metricCode != null && cube.units[metricCode]) || NO_UNIT
}

/** Format a value with its unit's decimals; "—" for a missing observation. */
export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: unit.decimals ?? 0,
    maximumFractionDigits: unit.decimals ?? 2,
  }).format(value)
}

/**
 * The unit as written after a value: "%" hugs it, a plain count says nothing
 * ("7,168", not "7,168 number").
 */
export function unitSuffix(unit: Unit): string {
  if (!unit.label || unit.label === 'number') return ''
  return unit.label === '%' ? '%' : ` ${unit.label}`
}

interface RawDimension {
  label?: string
  category: {
    index: Record<string, number> | string[]
    label?: Record<string, string>
    unit?: Record<string, { base?: string; decimals?: number }>
  }
}

/** The json-stat2 dataset PxWeb returns for a query. */
export interface RawJsonStat {
  label?: string
  source?: string
  updated?: string
  id: string[]
  size: number[]
  role?: { time?: string[]; metric?: string[]; geo?: string[] }
  dimension: Record<string, RawDimension>
  value: (number | null)[]
  extension?: { px?: { description?: string } }
}

/** Ordered [code, position] pairs from a category index (object or array form). */
function orderedCategories(dim: RawDimension): CubeCategory[] {
  const { index, label } = dim.category
  const codesByPos: string[] = []
  if (Array.isArray(index)) {
    index.forEach((code, pos) => (codesByPos[pos] = code))
  } else {
    for (const [code, pos] of Object.entries(index)) codesByPos[pos] = code
  }
  return codesByPos.map((code) => ({ code, label: label?.[code] ?? code }))
}

export function parseJsonStat(raw: RawJsonStat): Cube {
  const dims: CubeDim[] = raw.id.map((id) => {
    const cats = orderedCategories(raw.dimension[id])
    const label = raw.dimension[id].label ?? id
    let role: DimRole = 'other'
    if (raw.role?.time?.includes(id) || (!raw.role?.time?.length && looksLikeTime(id))) role = 'time'
    else if (raw.role?.geo?.includes(id) || looksLikeRegion(id, label, cats.map((c) => c.code)))
      role = 'geo'
    else if (raw.role?.metric?.includes(id)) role = 'metric'
    return { id, label, categories: cats, role }
  })

  // Strides for the row-major flat value array: the last dimension is contiguous.
  const strides: number[] = new Array(raw.size.length)
  let acc = 1
  for (let i = raw.size.length - 1; i >= 0; i--) {
    strides[i] = acc
    acc *= raw.size[i]
  }

  // Cartesian product of all category positions -> one record per cell.
  const records: CubeRecord[] = []
  const total = raw.value.length
  for (let flat = 0; flat < total; flat++) {
    const key: Record<string, string> = {}
    for (let d = 0; d < dims.length; d++) {
      const pos = Math.floor(flat / strides[d]) % raw.size[d]
      key[dims[d].id] = dims[d].categories[pos].code
    }
    records.push({ key, value: raw.value[flat] ?? null })
  }

  // Each measure carries its own unit: one table can mix counts, shares and
  // averages, and a chart must not label them all with the first one's.
  const metricDim = dims.find((d) => d.role === 'metric')
  const units: Record<string, Unit> = {}
  for (const [code, u] of Object.entries(
    (metricDim && raw.dimension[metricDim.id].category.unit) || {},
  )) {
    if (u?.base) units[code] = { label: u.base === 'per cent' ? '%' : u.base, decimals: u.decimals }
  }

  return {
    label: raw.label ?? '',
    description: raw.extension?.px?.description ?? '',
    source: raw.source ?? 'Statistics Finland',
    updated: raw.updated ?? '',
    units,
    dims,
    records,
    timeDim: dims.find((d) => d.role === 'time')?.id,
    geoDim: dims.find((d) => d.role === 'geo')?.id,
    metricDim: metricDim?.id,
  }
}
