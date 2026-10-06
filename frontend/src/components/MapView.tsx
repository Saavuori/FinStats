import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate ES module and finds it at runtime
// next to its own URL — a lookup the bundler can't follow, so the worker never
// reached the build and the map stayed blank. `?worker&url` makes Vite bundle
// it (together with the shared chunk it imports) and hand back its URL. The
// same fix as ratikka's Map.tsx.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection } from 'geojson'
import { formatValue, unitOf, unitSuffix, type Cube } from '../lib/jsonstat'
import { featureNumber, fetchBoundaries, type LevelAreas } from '../lib/wfs'
import { classColors, MAX_CLASSES } from '../lib/palette'
import { classOf, classRange, quantileClasses } from '../lib/classes'
import { BASEMAP_STYLES, REGION_STROKE, type Theme } from '../lib/theme'
import Caption from './Caption'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

interface Props {
  /** Holds every area of `level` (App widens the query for the map). */
  cube: Cube
  theme: Theme
  levels: LevelAreas[]
  level: LevelAreas
  onLevel: (key: string) => void
}

// Mainland Finland and Åland, so the country fills the frame at any width.
const FINLAND: maplibregl.LngLatBoundsLike = [
  [19.1, 59.6],
  [31.6, 70.1],
]
const SOURCE = 'regions'
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
// Areas without a value stay unfilled, outline only, so "no data" can't be
// mistaken for the lowest class.
const NO_DATA = 'rgba(0, 0, 0, 0)'

const legendNumber = (v: number) =>
  new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(v)

/**
 * Choropleth of a geographic table: one value per area, in quantile classes on
 * a single-hue ramp. Exactly one value of every other dimension is drawn at a
 * time, each picked in the toolbar. Geometry comes from the WFS service,
 * joined to the StatFin area codes by number.
 */
function MapView({ cube, theme, levels, level, onLevel }: Props) {
  const container = useRef<HTMLDivElement>(null)
  // The map whose style has finished loading, or null while none has. A theme
  // switch replaces the map, and data pushed into it before its new style
  // loads would throw ("Style is not done loading"), so only a map that has
  // fired `load` is ever stored here.
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [geo, setGeo] = useState<{ layer: string; fc: FeatureCollection } | null>(null)
  const [failedLayer, setFailedLayer] = useState<string | null>(null)
  const geoFailed = failedLayer === level.level.layer

  // App renders MapView only for a cube with a geographic dimension.
  const geoDim = cube.dims.find((d) => d.id === cube.geoDim)!
  const pickable = cube.dims.filter((d) => d.id !== geoDim.id && d.categories.length > 1)
  const fixed = cube.dims
    .filter((d) => d.id !== geoDim.id && d.categories.length === 1)
    .map((dim) => ({ dim, category: dim.categories[0] }))

  // Toolbar picks outlive a requery only while the new cube still has them;
  // otherwise the latest period and the first value of everything else.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const pins = useMemo(() => {
    const p: Record<string, string> = {}
    for (const d of cube.dims) {
      if (d.id === geoDim.id) continue
      const want = picks[d.id]
      p[d.id] = d.categories.some((c) => c.code === want)
        ? want
        : (d.id === cube.timeDim ? d.categories.at(-1) : d.categories[0])!.code
    }
    return p
  }, [cube, geoDim, picks])
  const unit = unitOf(cube, cube.metricDim ? pins[cube.metricDim] : undefined)

  // Load the level's polygons.
  useEffect(() => {
    let cancelled = false
    const layer = level.level.layer
    fetchBoundaries(level.level)
      .then((fc) => {
        if (cancelled) return
        setGeo({ layer, fc })
        setFailedLayer((f) => (f === layer ? null : f))
      })
      .catch(() => !cancelled && setFailedLayer(layer))
    return () => {
      cancelled = true
    }
  }, [level])

  // The level's polygons, once loaded (a stale level's are ignored).
  const shapes = geo && geo.layer === level.level.layer ? geo.fc : null
  const drawable = useMemo(
    () =>
      shapes &&
      new Set(shapes.features.map((f) => featureNumber(level.level, f.properties)).filter((n) => n != null)),
    [shapes, level],
  )

  // Area number -> value for the pinned slice. Only areas with a polygon
  // count: placeholders such as "MK91 Unknown" share the level's code
  // pattern, and would otherwise skew the classes without ever being drawn.
  const values = useMemo(() => {
    const m = new Map<string, number>()
    if (!drawable) return m
    const numOf = new Map(level.areas.map((a) => [a.code, a.num]))
    for (const rec of cube.records) {
      if (rec.value == null) continue
      if (!Object.entries(pins).every(([k, v]) => rec.key[k] === v)) continue
      const num = numOf.get(rec.key[geoDim.id])
      if (num != null && drawable.has(num)) m.set(num, rec.value)
    }
    return m
  }, [cube, geoDim, pins, level, drawable])

  const classes = useMemo(() => quantileClasses([...values.values()], MAX_CLASSES), [values])
  const colors = useMemo(
    () => classColors(classes ? classes.breaks.length + 1 : 1, theme),
    [classes, theme],
  )

  // Attach fill colour and display text to each feature, so the hover popup
  // reads everything from the feature itself.
  const coloured = useMemo(() => {
    if (!shapes) return null
    const features = shapes.features.map((f) => {
      const num = featureNumber(level.level, f.properties)
      const value = num == null ? undefined : values.get(num)
      return {
        ...f,
        properties: {
          ...f.properties,
          _fill: value == null || !classes ? NO_DATA : colors[classOf(value, classes.breaks)],
          _text: value == null ? 'No data' : formatValue(value, unit) + unitSuffix(unit),
        },
      }
    })
    return { type: 'FeatureCollection', features } as FeatureCollection
  }, [shapes, level, values, classes, colors, unit])

  // Create the map, with its layers and hover popup, when the theme (basemap)
  // changes.
  useEffect(() => {
    if (!container.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLES[theme],
      bounds: FINLAND,
      fitBoundsOptions: { padding: 12 },
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource(SOURCE, { type: 'geojson', data: EMPTY })
      m.addLayer({
        id: 'region-fill',
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': 0.85 },
      })
      m.addLayer({
        id: 'region-line',
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': REGION_STROKE[theme], 'line-width': 0.5 },
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
      m.on('mousemove', 'region-fill', (e: maplibregl.MapLayerMouseEvent) => {
        m.getCanvas().style.cursor = 'pointer'
        const p = e.features?.[0]?.properties
        if (!p) return
        popup.setLngLat(e.lngLat).setDOMContent(popupContent(p)).addTo(m)
      })
      m.on('mouseleave', 'region-fill', () => {
        m.getCanvas().style.cursor = ''
        popup.remove()
      })

      setMap(m)
    })
    return () => {
      setMap(null)
      m.remove()
    }
  }, [theme])

  // Push the colouring into the loaded map whenever it changes. A theme switch
  // recolours and replaces the map in one commit, so this can still see the
  // map being torn down (its source already gone); the replacement gets the
  // data once its own style has loaded.
  useEffect(() => {
    const source = map?.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined
    source?.setData(coloured ?? EMPTY)
  }, [map, coloured])

  return (
    <div className="map-wrap">
      <div className="chart-toolbar">
        {levels.length > 1 && (
          <label className="mini-select">
            Areas
            <select value={level.level.key} onChange={(e) => onLevel(e.target.value)}>
              {levels.map((l) => (
                <option key={l.level.key} value={l.level.key}>
                  {l.level.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {pickable.map((d) => (
          <label className="mini-select" key={d.id}>
            {d.label}
            <select value={pins[d.id]} onChange={(e) => setPicks((p) => ({ ...p, [d.id]: e.target.value }))}>
              {d.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <Caption fixed={fixed} />

      {geoFailed && (
        <div className="error-row">Could not load the area boundaries from Statistics Finland.</div>
      )}
      <div className="map-canvas" ref={container} />

      {classes && (
        <div className="legend" aria-label="Map legend">
          {colors.map((c, i) => {
            const [lo, hi] = classRange(classes, i)
            return (
              <span className="legend-item" key={i}>
                <span className="swatch" style={{ background: c }} />
                {lo === hi ? legendNumber(lo) : `${legendNumber(lo)}–${legendNumber(hi)}`}
              </span>
            )
          })}
          <span className="legend-item">
            <span className="swatch swatch-empty" />
            No data
          </span>
          {unitSuffix(unit) && <span className="legend-unit">{unitSuffix(unit).trim()}</span>}
        </div>
      )}
      <p className="map-hint">
        {drawable &&
          // "Regions" -> "regions", but "ELY centres" keeps its acronym.
          `${values.size} of ${drawable.size} ${level.level.label.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase())} have a value. `}
        Each colour holds about the same number of areas. Geometry &amp; data © Statistics Finland,
        CC BY 4.0.
      </p>
    </div>
  )
}

/**
 * Hover popup for one area. Built from DOM nodes rather than an HTML string:
 * the name comes from a third-party response, and text nodes cannot be
 * interpreted as markup.
 */
function popupContent(p: Record<string, unknown>): HTMLElement {
  const el = document.createElement('div')
  const value = document.createElement('strong')
  value.textContent = String(p._text ?? '')
  const name = document.createElement('div')
  name.textContent = String(p.name ?? p.nimi ?? '')
  el.append(value, name)
  return el
}

export default MapView
