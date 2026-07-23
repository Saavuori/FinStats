import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Variable } from '../types'

interface Props {
  variable: Variable
  selected: string[]
  onChange: (values: string[]) => void
  /** Single-select collapses the control to one value (used by the map view). */
  single?: boolean
}

/**
 * A searchable multi-select for one table variable. Variables range from 2
 * values (sex) to ~600 (municipalities), so it has a filter box and bulk
 * actions. Collapsed, it summarises the current pick; open, it lists values.
 */
function DimensionSelect({ variable, selected, onChange, single }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return variable.values
    return variable.values.filter(
      (v) => v.label.toLowerCase().includes(q) || v.code.toLowerCase().includes(q),
    )
  }, [variable.values, filter])

  const selectedSet = new Set(selected)

  function toggle(code: string) {
    if (single) {
      onChange([code])
      setOpen(false)
      return
    }
    const next = new Set(selectedSet)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    // Preserve API order.
    onChange(variable.values.filter((v) => next.has(v.code)).map((v) => v.code))
  }

  const summary =
    selected.length === 0
      ? 'none'
      : selected.length === 1
        ? (variable.values.find((v) => v.code === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`

  return (
    <div className={`dim ${open ? 'dim-open' : ''}`}>
      <button className="dim-head" onClick={() => setOpen((o) => !o)}>
        <span className="dim-label">
          {variable.label}
          {variable.time && <span className="dim-tag">time</span>}
          {variable.content && <span className="dim-tag">measure</span>}
        </span>
        <span className="dim-summary">
          {summary}
          <ChevronDown size={15} />
        </span>
      </button>

      {open && (
        <div className="dim-body">
          {variable.values.length > 8 && (
            <div className="dim-search">
              <Search size={14} />
              <input
                autoFocus
                value={filter}
                placeholder={`Filter ${variable.values.length} values…`}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          {!single && (
            <div className="dim-actions">
              <button onClick={() => onChange(variable.values.map((v) => v.code))}>
                Select all
              </button>
              <button onClick={() => onChange([])}>Clear</button>
              {variable.time && (
                <button
                  onClick={() =>
                    onChange(variable.values.slice(-12).map((v) => v.code))
                  }
                >
                  Latest 12
                </button>
              )}
            </div>
          )}

          <ul className="dim-list">
            {filtered.slice(0, 400).map((v) => (
              <li key={v.code}>
                <label>
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    checked={selectedSet.has(v.code)}
                    onChange={() => toggle(v.code)}
                  />
                  <span>{v.label}</span>
                  <code>{v.code}</code>
                </label>
              </li>
            ))}
            {filtered.length > 400 && (
              <li className="dim-more">…{filtered.length - 400} more — refine the filter</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default DimensionSelect
