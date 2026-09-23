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
