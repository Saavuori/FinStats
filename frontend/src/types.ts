// Shared types for the Statistics Finland PxWeb API (v1) and the shapes the UI
// derives from it. The API is documented at https://pxdata.stat.fi/api1.html
// and follows the PxWeb / Statistics Sweden specification.

/** A node in the database tree: either a folder (`type: "l"`) or a table (`"t"`). */
export interface DbNode {
  id: string
  type: 'l' | 't'
  text: string
  updated?: string
}

/** One selectable value of a variable, e.g. code "SSS" -> "Total". */
export interface VariableValue {
  code: string
  label: string
}

/** A variable (dimension) of a table, with all of its valid values. */
export interface Variable {
  code: string
  label: string
  values: VariableValue[]
  /** True for the variable PxWeb marks as time (detected heuristically). */
  time: boolean
  /** True when the variable carries the measured quantities (contents). */
  content: boolean
  elimination: boolean
}

/** Table metadata as returned by a GET on the table URL. */
export interface TableMeta {
  title: string
  variables: Variable[]
}

/** The user's current pick for one variable. */
export interface Selection {
  code: string
  values: string[]
}

/** A tidy, chart-ready row: one observation with its dimension labels. */
export interface DataPoint {
  /** Key of the category on the x-axis (time period or category code). */
  x: string
  xLabel: string
  /** Series key — the value code that distinguishes this line/bar. */
  series: string
  seriesLabel: string
  value: number | null
  /** Region code, present only when a geographic variable was selected. */
  region?: string
}

/** Parsed, flattened result of a data query plus the axes the UI should use. */
export interface Dataset {
  label: string
  source: string
  updated: string
  unit: string
  points: DataPoint[]
  /** Ordered, de-duplicated x categories (preserves API order). */
  xCategories: { code: string; label: string }[]
  /** Ordered, de-duplicated series. */
  seriesList: { code: string; label: string }[]
}
