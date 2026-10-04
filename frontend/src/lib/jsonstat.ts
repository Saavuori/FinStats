// Minimal JSON-stat v2 reader, tailored to what the UI needs.
//
// A json-stat2 "dataset" stores every observation in a single flat `value`
// array, indexed row-major over the dimensions listed in `id` (the last
// dimension varies fastest). Each dimension carries a category index (code ->
// position) and labels. We unfold that into tidy records the chart and map can
// slice independently. Spec: https://json-stat.org/full/

import { looksLikeRegion } from './pxweb'

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

/** Unit of one measure, from the metric dimension's category metadata. */
export interface CubeUnit {
  base: string
  decimals?: number
}

export interface Cube {
  label: string
  source: string
  updated: string
  /**
   * Units keyed by metric category code. Measures in one table can differ
   * ("index point" vs "per cent"), so read them through `unitOf`.
   */
  units: Record<string, CubeUnit>
  dims: CubeDim[]
  records: CubeRecord[]
  timeDim?: string
  geoDim?: string
  metricDim?: string
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
    if (raw.role?.time?.includes(id)) role = 'time'
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

  // Per-measure units from the metric dimension, if any.
  const metricDim = dims.find((d) => d.role === 'metric')
  const units: Record<string, CubeUnit> = {}
  if (metricDim) {
    const rawUnit = raw.dimension[metricDim.id].category.unit ?? {}
    for (const [code, u] of Object.entries(rawUnit)) {
      units[code] = { base: u.base ?? '', decimals: u.decimals }
    }
  }

  return {
    label: raw.label ?? '',
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

/**
 * The unit of one measure. With no metric dimension, or a single measure,
 * `measure` may be omitted and the table's only unit is returned.
 */
export function unitOf(cube: Cube, measure?: string): CubeUnit | undefined {
  if (measure != null) return cube.units[measure]
  const all = Object.values(cube.units)
  return all.length === 1 ? all[0] : undefined
}
