// Minimal JSON-stat v2 reader, tailored to what the UI needs.
//
// A json-stat2 "dataset" stores every observation in a single flat `value`
// array, indexed row-major over the dimensions listed in `id` (the last
// dimension varies fastest). Each dimension carries a category index (code ->
// position) and labels. We unfold that into tidy records the chart and map can
// slice independently. Spec: https://json-stat.org/full/

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

export interface Cube {
  label: string
  source: string
  updated: string
  unit: string
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

interface RawJsonStat {
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

/** Detect a region dimension when the API didn't tag one via role.geo. */
function looksGeographic(id: string, cats: CubeCategory[]): boolean {
  if (/^alue/i.test(id)) return true
  return cats.some((c) => /^(KU|MK|SK|MA)\d/.test(c.code))
}

export function parseJsonStat(raw: RawJsonStat): Cube {
  const dims: CubeDim[] = raw.id.map((id) => {
    const cats = orderedCategories(raw.dimension[id])
    let role: DimRole = 'other'
    if (raw.role?.time?.includes(id)) role = 'time'
    else if (raw.role?.geo?.includes(id) || looksGeographic(id, cats)) role = 'geo'
    else if (raw.role?.metric?.includes(id)) role = 'metric'
    return { id, label: raw.dimension[id].label ?? id, categories: cats, role }
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

  // Unit label from the metric dimension, if any.
  const metricDim = dims.find((d) => d.role === 'metric')
  let unit = ''
  if (metricDim) {
    const rawUnit = raw.dimension[metricDim.id].category.unit
    const first = rawUnit && Object.values(rawUnit)[0]
    if (first?.base) unit = first.base
  }

  return {
    label: raw.label ?? '',
    source: raw.source ?? 'Statistics Finland',
    updated: raw.updated ?? '',
    unit,
    dims,
    records,
    timeDim: dims.find((d) => d.role === 'time')?.id,
    geoDim: dims.find((d) => d.role === 'geo')?.id,
    metricDim: metricDim?.id,
  }
}

/** Look up one observation by its full dimension key. */
export function valueAt(cube: Cube, key: Record<string, string>): number | null {
  const hit = cube.records.find((r) =>
    Object.entries(key).every(([k, v]) => r.key[k] === v),
  )
  return hit ? hit.value : null
}
