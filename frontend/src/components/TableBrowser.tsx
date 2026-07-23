import { useEffect, useMemo, useState } from 'react'
import { Search, Folder, Table2, ChevronRight, Loader2 } from 'lucide-react'
import { browse, search, type Lang, type SearchHit } from '../lib/pxweb'
import type { DbNode } from '../types'

interface Props {
  lang: Lang
  onSelect: (path: string, id: string, title: string) => void
}

/**
 * Two ways to reach a table: browse the StatFin subject tree, or full-text
 * search. Search wins when there's a query; otherwise we show the current
 * folder with a breadcrumb back up.
 */
function TableBrowser({ lang, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [crumbs, setCrumbs] = useState<{ id: string; text: string }[]>([])
  const [nodes, setNodes] = useState<DbNode[]>([])
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const path = useMemo(() => crumbs.map((c) => c.id).join('/'), [crumbs])

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Browse the current folder (only when not searching).
  useEffect(() => {
    if (debounced) return
    let cancelled = false
    setLoading(true)
    setError(null)
    browse(lang, path)
      .then((n) => !cancelled && setNodes(n))
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [lang, path, debounced])

  // Run search.
  useEffect(() => {
    if (!debounced) {
      setHits([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    search(lang, debounced)
      .then((h) => !cancelled && setHits(h))
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [lang, debounced])

  function openNode(n: DbNode) {
    if (n.type === 'l') {
      setCrumbs((c) => [...c, { id: n.id, text: n.text }])
    } else {
      onSelect(path, n.id, cleanTitle(n.text))
    }
  }

  return (
    <div className="browser">
      <div className="browser-search">
        <Search size={16} />
        <input
          value={query}
          placeholder="Search thousands of StatFin tables… (e.g. population, wages, CO2)"
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <Loader2 size={16} className="spin" />}
      </div>

      {!debounced && (
        <div className="crumbs">
          <button onClick={() => setCrumbs([])}>StatFin</button>
          {crumbs.map((c, i) => (
            <span key={c.id}>
              <ChevronRight size={13} />
              <button onClick={() => setCrumbs((cc) => cc.slice(0, i + 1))}>{c.text}</button>
            </span>
          ))}
        </div>
      )}

      {error && <div className="error-row">{error}</div>}

      <ul className="node-list">
        {debounced
          ? hits.map((h) => (
              <li key={h.path + h.id}>
                <button onClick={() => onSelect(h.path, h.id, cleanTitle(h.title))}>
                  <Table2 size={16} className="ico-table" />
                  <span className="node-text">{cleanTitle(h.title)}</span>
                  <span className="node-path">{h.path.replace(/^\//, '')}</span>
                </button>
              </li>
            ))
          : nodes.map((n) => (
              <li key={n.id}>
                <button onClick={() => openNode(n)}>
                  {n.type === 'l' ? (
                    <Folder size={16} className="ico-folder" />
                  ) : (
                    <Table2 size={16} className="ico-table" />
                  )}
                  <span className="node-text">{cleanTitle(n.text)}</span>
                  {n.type === 'l' && <ChevronRight size={15} className="node-chev" />}
                </button>
              </li>
            ))}
        {!loading && debounced && hits.length === 0 && (
          <li className="node-empty">No tables match “{debounced}”.</li>
        )}
      </ul>
    </div>
  )
}

/** Table titles arrive as "11rb -- Population…"; drop the leading code. */
function cleanTitle(text: string): string {
  return text.replace(/^\w+\s*--\s*/, '')
}

export default TableBrowser
