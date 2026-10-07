import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Database,
  Download,
  Link2,
  Loader2,
  Map as MapIcon,
  Moon,
  Sun,
  Table2,
} from 'lucide-react'
import TableBrowser from './components/TableBrowser'
import Discover from './components/Discover'
import DimensionSelect from './components/DimensionSelect'
import ChartView from './components/ChartView'
import TableView from './components/TableView'
import ErrorBoundary from './components/ErrorBoundary'
import VersionBadge from './components/VersionBadge'
import { cleanTitle, getMeta, isRegion, queryTable, tableUrl, type Lang } from './lib/pxweb'
import { mapLevels, pickLevel } from './lib/wfs'
import { parseJsonStat, type Cube } from './lib/jsonstat'
import { cubeToCsv, download } from './lib/csv'
import {
  readUrl,
  resolveSelections,
  selectionDiff,
  writeUrl,
  type ChartKind,
  type View,
} from './lib/urlstate'
import { loadTheme, saveTheme, type Theme } from './lib/theme'
import type { TableMeta } from './types'

// MapLibre is most of the bundle; fetch it the first time a map is shown.
const MapView = lazy(() => import('./components/MapView'))

const CELL_LIMIT = 120000

// The UI is English-only for now; PxWeb also serves 'fi' and 'sv'.
const LANG: Lang = 'en'

const HOME_TITLE = 'finstats — Statistics Finland data explorer'

interface Picked {
  ref: string
  url: string
  title: string
  meta: TableMeta
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [view, setView] = useState<View>('chart')
  const [kind, setKind] = useState<ChartKind | undefined>()
  const [xId, setXId] = useState<string | undefined>()
  const [levelKey, setLevelKey] = useState<string | undefined>()
  // The data, and the query it answers: a view switch can leave the two out
  // of step until the new query lands.
  const [cube, setCube] = useState<Cube | null>(null)
  const [cubeKey, setCubeKey] = useState('')

  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }

  // ---- Navigation -------------------------------------------------------
  // The address bar says which table is open and how it is viewed, so every
  // view can be bookmarked, shared, reloaded and reached with Back/Forward.

  const pickedRef = useRef<Picked | null>(null)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])

  // Only the latest navigation may land: a slower metadata response for a
  // table left behind must not replace the current one.
  const navRequest = useRef(0)

  /** Show what the URL describes. `title` is the browser's name for a table. */
  const applyUrl = useCallback(async (title?: string) => {
    const request = ++navRequest.current
    const state = readUrl(window.location.search)
    // Leaving a table forgets its data — and which query it answered, or
    // reopening it with the same picks would wait for data that never comes.
    const leave = () => {
      setPicked(null)
      setCube(null)
      setCubeKey('')
    }
    setError(null)
    if (!state) {
      leave()
      setLoadingMeta(false)
      return
    }

    let meta = pickedRef.current?.ref === state.table ? pickedRef.current.meta : null
    if (!meta) {
      leave()
      setLoadingMeta(true)
      try {
        meta = await getMeta(tableUrl(LANG, state.table))
      } catch (e) {
        if (request === navRequest.current) {
          setError(errText(e))
          setLoadingMeta(false)
        }
        return
      }
      if (request !== navRequest.current) return
      setLoadingMeta(false)
      setPicked({ ref: state.table, url: tableUrl(LANG, state.table), title: title ?? meta.title, meta })
    }
    setSelections(resolveSelections(meta, state.sel))
    setView(state.view)
    setKind(state.kind)
    setXId(state.x)
    setLevelKey(state.level)
  }, [])

  useEffect(() => {
    // Reading the address bar on mount is syncing with an external system,
    // exactly what an effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    applyUrl()
    const onPop = () => applyUrl()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyUrl])

  /** Go to an explorer URL ('' = the table list) as a new history entry. */
  function navigate(search: string, title?: string) {
    window.history.pushState(null, '', search || window.location.pathname)
    applyUrl(title)
  }

  /** Same-tab navigation for in-app links; modified clicks open a new tab. */
  function followLink(e: MouseEvent<HTMLAnchorElement>, search: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(search)
  }

  /** Open a table on its default view. */
  function openTable(ref: string, title: string) {
    navigate(writeUrl({ table: ref, view: 'chart', sel: {} }), title)
  }

  // Mirror picks and view into the URL. Replace, don't push: each checkbox
  // would otherwise become a Back-button step.
  useEffect(() => {
    if (!picked) return
    const next = writeUrl({
      table: picked.ref,
      view,
      kind,
      x: xId,
      level: levelKey,
      sel: selectionDiff(picked.meta, selections),
    })
    if (next !== window.location.search) window.history.replaceState(null, '', next)
  }, [picked, selections, view, kind, xId, levelKey])

  // ---- What to query ----------------------------------------------------

  const geoVar = useMemo(() => picked?.meta.variables.find(isRegion), [picked])
  const levels = useMemo(
    () => (geoVar ? mapLevels(geoVar.code, geoVar.label, geoVar.values.map((v) => v.code)) : []),
    [geoVar],
  )
  // A map link for a table without boundaries falls back to the chart.
  const shownView: View = view === 'map' && !levels.length ? 'chart' : view
  const level =
    shownView === 'map' && geoVar
      ? pickLevel(levels, selections[geoVar.code] ?? [], levelKey)
      : undefined

  // The map draws every area of its level, whatever the sidebar picked; the
  // picks stay as they were for the chart and table.
  const query = useMemo(
    () =>
      level && geoVar
        ? { ...selections, [geoVar.code]: level.areas.map((a) => a.code) }
        : selections,
    [selections, level, geoVar],
  )
  const queryKey = picked ? `${picked.url}\n${JSON.stringify(query)}` : ''

  // Estimated response size = product of selected counts.
  const cells = useMemo(
    () => Object.values(query).reduce((n, v) => n * Math.max(v.length, 1), 1),
    [query],
  )

  // Derived rather than stored, so it clears as soon as the selection shrinks.
  const tooLarge =
    cells > CELL_LIMIT
      ? `Selection is too large (${cells.toLocaleString('en-US')} cells). Narrow it below ${CELL_LIMIT.toLocaleString('en-US')}.`
      : null

  // Requery whenever the query changes (debounced). A response that arrives
  // after the query or table has moved on is dropped, so an older query can
  // never overwrite a newer one's chart.
  useEffect(() => {
    if (!picked || queryKey === cubeKey) return
    const anyEmpty = picked.meta.variables.some((v) => (query[v.code]?.length ?? 0) === 0)
    if (anyEmpty || cells > CELL_LIMIT) return

    let stale = false
    const timer = window.setTimeout(async () => {
      setLoadingData(true)
      setError(null)
      try {
        const raw = await queryTable(picked.url, query)
        if (!stale) {
          setCube(parseJsonStat(raw))
          setCubeKey(queryKey)
        }
      } catch (e) {
        if (!stale) setError(errText(e))
      } finally {
        if (!stale) setLoadingData(false)
      }
    }, 450)
    return () => {
      stale = true
      window.clearTimeout(timer)
      setLoadingData(false)
    }
  }, [picked, query, queryKey, cubeKey, cells])

  // ---- Page --------------------------------------------------------------

  const title = cube?.description ? cleanTitle(cube.description) : picked?.title
  useEffect(() => {
    document.title = title ? `${title} — finstats` : HOME_TITLE
  }, [title])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable (permissions, insecure context): the address bar still has it */
    }
  }

  function downloadCsv() {
    if (!cube || !picked) return
    const id = picked.ref.split('/').pop()!.replace(/\.px$/, '')
    download(`statfin-${id}.csv`, cubeToCsv(cube))
  }

  const fresh = cubeKey === queryKey

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Database size={20} className="brand-ico" />
          <div>
            <h1>finstats</h1>
            <p>Statistics Finland data explorer</p>
          </div>
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {/* Kept mounted while a table is open, so going back finds the same search. */}
      <main className="landing" hidden={!!picked}>
        <p className="lede">
          Explore thousands of open statistical tables from Tilastokeskus — population, economy,
          housing, environment and more — as interactive charts, maps and tables you can share and
          download. Start from a popular table, see what was just published, or search everything.
        </p>

        {loadingMeta && (
          <div className="loading-row">
            <Loader2 className="spin" /> Loading table…
          </div>
        )}
        {error && !picked && <div className="error-row">{error}</div>}
        <TableBrowser
          lang={LANG}
          onSelect={openTable}
          home={<Discover lang={LANG} onLink={followLink} onSelect={openTable} />}
        />
      </main>

      {picked && (
        <main className="explorer">
          <div className="explorer-head">
            <button className="back" onClick={() => navigate('')}>
              <ArrowLeft size={15} /> Tables
            </button>
            <h2>{title}</h2>
          </div>

          <div className="panel">
            <aside className="controls">
              <div className="controls-title">Dimensions</div>
              {picked.meta.variables.map((v) =>
                level && v.code === geoVar?.code ? (
                  <div className="dim dim-locked" key={v.code}>
                    <div className="dim-head">
                      <span className="dim-label">
                        {v.label}
                        <span className="dim-tag">map</span>
                      </span>
                      <span className="dim-summary">all {level.areas.length}</span>
                    </div>
                    <p className="dim-note">
                      The map shows every area. Your picks here still apply to the chart and table.
                    </p>
                  </div>
                ) : (
                  <DimensionSelect
                    key={v.code}
                    variable={v}
                    selected={selections[v.code] ?? []}
                    onChange={(vals) => setSelections((s) => ({ ...s, [v.code]: vals }))}
                  />
                ),
              )}
              <div className="cells-note">
                ~{cells.toLocaleString('en-US')} cells{cells > CELL_LIMIT && ' · too large'}
              </div>
            </aside>

            <section className="viz">
              <div className="viz-tabs">
                <button className={shownView === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>
                  <BarChart3 size={15} /> Chart
                </button>
                <button
                  className={shownView === 'map' ? 'on' : ''}
                  onClick={() => setView('map')}
                  disabled={!levels.length}
                  title={
                    levels.length
                      ? ''
                      : geoVar
                        ? 'Statistics Finland publishes no map boundaries for these areas'
                        : 'This table has no regional dimension'
                  }
                >
                  <MapIcon size={15} /> Map
                </button>
                <button className={shownView === 'table' ? 'on' : ''} onClick={() => setView('table')}>
                  <Table2 size={15} /> Table
                </button>
                {loadingData && <Loader2 size={15} className="spin viz-spin" aria-label="Loading" />}
                <div className="viz-actions">
                  <button className="action" onClick={copyLink} title="Copy a link to exactly this view">
                    {copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    className="action"
                    onClick={downloadCsv}
                    disabled={!cube}
                    title="Download the data shown, one row per value"
                  >
                    <Download size={15} /> CSV
                  </button>
                </div>
              </div>

              {(tooLarge ?? error) && <div className="error-row">{tooLarge ?? error}</div>}

              {!cube && !tooLarge && !error && (
                <div className="viz-empty">
                  {loadingData ? 'Querying Statistics Finland…' : 'Adjust the dimensions to load data.'}
                </div>
              )}

              {cube && (
                <div className={!fresh && loadingData ? 'viz-body viz-stale' : 'viz-body'}>
                  {/* Keyed so a failed view gets a fresh try on the next table or tab. */}
                  <ErrorBoundary key={`${picked.ref} ${shownView}`}>
                    {shownView === 'chart' && (
                      <ChartView
                        key={picked.ref}
                        cube={cube}
                        theme={theme}
                        kind={kind}
                        xId={xId}
                        onKind={setKind}
                        onX={setXId}
                      />
                    )}
                    {shownView === 'table' && <TableView cube={cube} xId={xId} onX={setXId} />}
                    {shownView === 'map' && level && cube.geoDim && (
                      <Suspense fallback={<div className="viz-empty">Loading map…</div>}>
                        <MapView
                          cube={cube}
                          theme={theme}
                          levels={levels}
                          level={level}
                          onLevel={setLevelKey}
                        />
                      </Suspense>
                    )}
                  </ErrorBoundary>

                  <div className="source-line">
                    {cube.source}
                    {cube.updated &&
                      ` · updated ${new Date(cube.updated).toLocaleDateString('fi-FI')}`}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      )}

      <footer className="foot">
        <span>
          Data © Statistics Finland (<a href="https://stat.fi/" target="_blank" rel="noreferrer">stat.fi</a>), CC BY 4.0.
          Not affiliated with Statistics Finland.
        </span>
        <VersionBadge />
      </footer>
    </div>
  )
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
