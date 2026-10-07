import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { BarChart3, Map as MapIcon, Table2, ChevronDown } from 'lucide-react'
import { browse, cleanTitle, recentTables, tableRef, type Lang, type SearchHit } from '../lib/pxweb'
import { STARTERS } from '../lib/starters'
import { writeUrl } from '../lib/urlstate'
import { relativeDay, shortDate } from '../lib/dates'

interface Props {
  lang: Lang
  /** In-app navigation for a starter link (modified clicks open a new tab). */
  onLink: (e: MouseEvent<HTMLAnchorElement>, href: string) => void
  /** A release's table was chosen: its reference and display title. */
  onSelect: (ref: string, title: string) => void
}

/** Release-feed length, and tables listed per release before "more". */
const RELEASES = 8
const PREVIEW = 3

/** One subject's tables published on the same day. */
interface Release {
  path: string
  subject: string
  published: string
  tables: SearchHit[]
}

/**
 * The landing page's two ways in for someone who doesn't know what to search
 * for: hand-picked popular tables, and a feed of what Statistics Finland has
 * published most recently.
 */
function Discover({ lang, onLink, onSelect }: Props) {
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [subjects, setSubjects] = useState<Map<string, string>>(new Map())
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    recentTables(lang)
      .then((h) => !cancelled && setHits(h))
      .catch(() => !cancelled && setFailed(true))
    // Subject names for the feed; the browser below fetches (and caches) the
    // same listing, so this costs no extra call.
    browse(lang, '')
      .then((nodes) => !cancelled && setSubjects(new Map(nodes.map((n) => [n.id, n.text]))))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lang])

  // "khi/15b5.px" -> when it was published, to date the starter cards.
  const published = useMemo(
    () => new Map((hits ?? []).map((h) => [tableRef(h.path, h.id), h.published])),
    [hits],
  )

  const releases = useMemo(() => {
    const groups = new Map<string, Release>()
    for (const h of hits ?? []) {
      if (!h.published) continue
      const path = h.path.replace(/^\//, '')
      const key = `${path} ${h.published.slice(0, 10)}`
      let g = groups.get(key)
      if (!g) {
        g = { path, subject: subjects.get(path) ?? path, published: h.published, tables: [] }
        groups.set(key, g)
      }
      g.tables.push(h)
      if (h.published > g.published) g.published = h.published
    }
    return [...groups.values()]
      .sort((a, b) => b.published.localeCompare(a.published))
      .slice(0, RELEASES)
  }, [hits, subjects])

  function toggle(key: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="discover">
      <section>
        <h3 className="section-title">Popular tables</h3>
        <ul className="featured">
          {STARTERS.map((s) => {
            const href = writeUrl(s.state)
            const updated = published.get(s.state.table)
            return (
              <li key={s.title}>
                <a href={href} onClick={(e) => onLink(e, href)}>
                  <span className="featured-head">
                    {s.state.view === 'map' ? <MapIcon size={15} /> : <BarChart3 size={15} />}
                    {s.title}
                  </span>
                  <span className="featured-blurb">{s.blurb}</span>
                  {updated && <span className="featured-date">Updated {shortDate(updated)}</span>}
                </a>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3 className="section-title">Latest releases</h3>
        {failed && <div className="node-empty">Couldn’t load the latest releases.</div>}
        {!hits && !failed && <div className="node-empty">Loading…</div>}
        <ul className="releases">
          {releases.map((r) => {
            const key = `${r.path} ${r.published}`
            const shown = open.has(key) ? r.tables : r.tables.slice(0, PREVIEW)
            return (
              <li key={key}>
                <div className="release-head">
                  <span className="release-subject">{r.subject}</span>
                  <span className="release-date" title={shortDate(r.published)}>
                    {relativeDay(r.published)}
                  </span>
                </div>
                <ul className="node-list release-tables">
                  {shown.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => onSelect(tableRef(r.path, t.id), cleanTitle(t.title))}>
                        <Table2 size={15} className="ico-table" />
                        <span className="node-text">{cleanTitle(t.title)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {r.tables.length > PREVIEW && (
                  <button className="release-more" onClick={() => toggle(key)}>
                    <ChevronDown size={14} className={open.has(key) ? 'flip' : ''} />
                    {open.has(key) ? 'Show fewer' : `${r.tables.length - PREVIEW} more tables`}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default Discover
