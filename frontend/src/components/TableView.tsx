import { useMemo } from 'react'
import { formatValue, unitSuffix, type Cube } from '../lib/jsonstat'
import { axisCandidates, buildChart } from '../lib/series'
import Caption from './Caption'

interface Props {
  cube: Cube
  /** The dimension down the rows — the chart's x-axis, so both views agree. */
  xId?: string
  onX: (dimId: string) => void
}

// Beyond this the page gets sluggish and nobody reads on; the CSV has it all.
const MAX_ROWS = 500

/**
 * The numbers behind the chart: one row per x-axis value, one column per
 * series — every series, including any the chart had no colour for.
 */
function TableView({ cube, xId, onX }: Props) {
  const model = useMemo(() => buildChart(cube, xId), [cube, xId])
  const axes = axisCandidates(cube)
  const rows = model.rows.slice(0, MAX_ROWS)

  return (
    <div className="table-wrap">
      {axes.length > 1 && (
        <div className="chart-toolbar">
          <label className="mini-select">
            Rows
            <select value={model.x.id} onChange={(e) => onX(e.target.value)}>
              {axes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <Caption fixed={model.fixed} />

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{model.x.label}</th>
              {model.series.map((s) => (
                <th scope="col" key={s.key}>
                  {s.label}
                  {unitSuffix(s.unit) && <span className="th-unit">{unitSuffix(s.unit).trim()}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.code}>
                <th scope="row">{r.label}</th>
                {r.values.map((v, i) => (
                  <td key={model.series[i].key}>
                    {formatValue(v, model.rowUnits?.[ri] ?? model.series[i].unit)}
                    {v != null && model.rowUnits && unitSuffix(model.rowUnits[ri])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {model.rows.length > MAX_ROWS && (
        <p className="note">
          Showing the first {MAX_ROWS} of {model.rows.length.toLocaleString('en-US')} rows — the CSV
          download has all of them.
        </p>
      )}
    </div>
  )
}

export default TableView
