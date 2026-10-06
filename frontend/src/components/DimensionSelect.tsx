import { useId, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Variable } from '../types'

interface Props {
  variable: Variable
  selected: string[]
  onChange: (values: string[]) => void
}

/**
 * A searchable multi-select for one table variable. Variables range from 2
 * values (sex) to ~600 (areas), so it has a filter box and bulk actions, and
 * every value has an "only" shortcut for the common "just this one" pick.
 * Collapsed, it summarises the current pick; open, it lists values.
 */
function DimensionSelect({ variable, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const bodyId = useId()

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return variable.values
    return variable.values.filter(
      (v) => v.label.toLowerCase().includes(q) || v.code.toLowerCase().includes(q),
    )
  }, [variable.values, filter])

  const selectedSet = new Set(selected)

  function toggle(code: string) {
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
        : selected.length === variable.values.length
          ? `all ${selected.length}`
          : `${selected.length} selected`

  return (
    <div className={`dim ${open ? 'dim-open' : ''}`}>
      <button
        className="dim-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="dim-label">
          {variable.label}
          {variable.time && <span className="dim-tag">time</span>}
          {variable.content && <span className="dim-tag">measure</span>}
        </span>
        <span className="dim-summary">
          <span className="dim-summary-text">{summary}</span>
          <ChevronDown size={15} />
        </span>
      </button>

      {open && (
        <div className="dim-body" id={bodyId}>
          {variable.values.length > 8 && (
            <div className="dim-search">
              <Search size={14} />
              <input
                autoFocus
                value={filter}
                placeholder={`Filter ${variable.values.length} values…`}
                aria-label={`Filter ${variable.label}`}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          <div className="dim-actions">
            <button onClick={() => onChange(variable.values.map((v) => v.code))}>
              Select all
            </button>
            <button onClick={() => onChange([])}>Clear</button>
            {variable.time && (
              <button onClick={() => onChange(variable.values.slice(-12).map((v) => v.code))}>
                Latest 12
              </button>
            )}
          </div>

          <ul className="dim-list">
            {filtered.slice(0, 400).map((v) => (
              <li key={v.code}>
                <label title={v.code}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(v.code)}
                    onChange={() => toggle(v.code)}
                  />
                  <span>{v.label}</span>
                </label>
                <button
                  className="dim-only"
                  onClick={() => onChange([v.code])}
                  aria-label={`Only ${v.label}`}
                >
                  only
                </button>
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
