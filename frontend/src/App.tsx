import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Map as MapIcon, Moon, Sun, Loader2, ArrowLeft, Database } from 'lucide-react'
import TableBrowser from './components/TableBrowser'
import DimensionSelect from './components/DimensionSelect'
import ChartView from './components/ChartView'
import MapView from './components/MapView'
import VersionBadge from './components/VersionBadge'
import { getMeta, queryTable, tableUrl, isRegion, type Lang } from './lib/pxweb'
import { municipalityCode } from './lib/wfs'
import { parseJsonStat, type Cube } from './lib/jsonstat'
import { loadTheme, saveTheme, type Theme } from './lib/theme'
import type { TableMeta } from './types'

const CELL_LIMIT = 120000

// The UI is English-only for now; PxWeb also serves 'fi' and 'sv'.
const LANG: Lang = 'en'

interface Picked {
  url: string
  title: string
  meta: TableMeta
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [cube, setCube] = useState<Cube | null>(null)
  const [view, setView] = useState<'chart' | 'map'>('chart')

  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const hasGeo = useMemo(
    () => !!picked && picked.meta.variables.some(isRegion),
    [picked],
  )

  // Pick a table -> fetch metadata -> seed sensible default selections. Only
  // the latest pick may land: a slower response for a table clicked earlier
  // must not replace it.
  const metaRequest = useRef(0)
  const onSelectTable = useCallback(
    async (path: string, id: string, title: string) => {
      const request = ++metaRequest.current
      const url = tableUrl(LANG, path, id)
      setLoadingMeta(true)
      setError(null)
      setCube(null)
      setView('chart')
      try {
        const meta = await getMeta(url)
        if (request !== metaRequest.current) return
        const seed: Record<string, string[]> = {}
        for (const v of meta.variables) {
          if (v.time) {
            seed[v.code] = v.values.slice(-20).map((x) => x.code)
          } else if (isRegion(v)) {
            const whole = v.values.find((x) => x.code === 'SSS')
            seed[v.code] = [whole?.code ?? v.values[0].code]
          } else {
            seed[v.code] = [v.values[0].code]
          }
        }
        setSelections(seed)
        setPicked({ url, title, meta })
      } catch (e) {
        if (request === metaRequest.current) setError(errText(e))
      } finally {
        if (request === metaRequest.current) setLoadingMeta(false)
      }
    },
    [],
  )

  // Estimated response size = product of selected counts.
  const cells = useMemo(
    () => Object.values(selections).reduce((n, v) => n * Math.max(v.length, 1), 1),
    [selections],
  )

  // Derived rather than stored, so it clears as soon as the selection shrinks.
  const tooLarge =
    cells > CELL_LIMIT
      ? `Selection is too large (${cells.toLocaleString()} cells). Narrow it below ${CELL_LIMIT.toLocaleString()}.`
      : null

  // Requery whenever the selection changes (debounced). A response that
  // arrives after the selection or table has moved on is dropped, so an older
  // query can never overwrite a newer one's chart.
  useEffect(() => {
    if (!picked) return
    const anyEmpty = picked.meta.variables.some((v) => (selections[v.code]?.length ?? 0) === 0)
    if (anyEmpty || cells > CELL_LIMIT) return

    let stale = false
    const timer = window.setTimeout(async () => {
      setLoadingData(true)
      setError(null)
      try {
        const raw = await queryTable(picked.url, selections)
        if (!stale) setCube(parseJsonStat(raw))
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
  }, [picked, selections, cells])

  // Switching to the map needs every municipality; expand the geo dimension.
  function switchView(next: 'chart' | 'map') {
    setView(next)
    if (next !== 'map' || !picked) return
    const geoVar = picked.meta.variables.find(isRegion)
    if (!geoVar) return
    const municipalities = geoVar.values
      .filter((v) => municipalityCode(v.code) != null)
      .map((v) => v.code)
    if (municipalities.length && selections[geoVar.code]?.length !== municipalities.length) {
      setSelections((s) => ({ ...s, [geoVar.code]: municipalities }))
    }
  }

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

      {!picked ? (
        <main className="landing">
          <p className="lede">
            Explore thousands of open statistical tables from Tilastokeskus — population,
            economy, housing, environment and more — as interactive charts and maps.
            Search or browse to begin.
          </p>
          {loadingMeta && <div className="loading-row"><Loader2 className="spin" /> Loading table…</div>}
          {error && <div className="error-row">{error}</div>}
          <TableBrowser lang={LANG} onSelect={onSelectTable} />
        </main>
      ) : (
        <main className="explorer">
          <div className="explorer-head">
            <button className="back" onClick={() => { setPicked(null); setCube(null); setError(null) }}>
              <ArrowLeft size={15} /> Tables
            </button>
            <h2>{picked.title}</h2>
          </div>

          <div className="panel">
            <aside className="controls">
              <div className="controls-title">Dimensions</div>
              {picked.meta.variables.map((v) => (
                <DimensionSelect
                  key={v.code}
                  variable={v}
                  selected={selections[v.code] ?? []}
                  onChange={(vals) => setSelections((s) => ({ ...s, [v.code]: vals }))}
                />
              ))}
              <div className="cells-note">
                ~{cells.toLocaleString()} cells{cells > CELL_LIMIT && ' · too large'}
              </div>
            </aside>

            <section className="viz">
              <div className="viz-tabs">
                <button className={view === 'chart' ? 'on' : ''} onClick={() => switchView('chart')}>
                  <BarChart3 size={15} /> Chart
                </button>
                <button
                  className={view === 'map' ? 'on' : ''}
                  onClick={() => switchView('map')}
                  disabled={!hasGeo}
                  title={hasGeo ? '' : 'This table has no regional dimension'}
                >
                  <MapIcon size={15} /> Map
                </button>
                {loadingData && <Loader2 size={15} className="spin viz-spin" />}
              </div>

              {(tooLarge ?? error) && <div className="error-row">{tooLarge ?? error}</div>}

              {!cube && !tooLarge && !error && (
                <div className="viz-empty">
                  {loadingData ? 'Querying Statistics Finland…' : 'Adjust the dimensions to load data.'}
                </div>
              )}

              {cube && view === 'chart' && <ChartView cube={cube} />}
              {cube && view === 'map' && hasGeo && cube.geoDim && <MapView cube={cube} theme={theme} />}

              {cube && (
                <div className="source-line">
                  {cube.source}
                  {cube.updated && ` · updated ${new Date(cube.updated).toLocaleDateString('fi-FI')}`}
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
