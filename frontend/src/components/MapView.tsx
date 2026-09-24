import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { Cube } from '../lib/jsonstat'
import { fetchMunicipalities, municipalityCode } from '../lib/wfs'
import { choroplethColor, SERIES_COLORS } from '../lib/palette'
import { BASEMAP_STYLES, REGION_STROKE, type Theme } from '../lib/theme'

interface Props {
  cube: Cube
  theme: Theme
}

const FINLAND: [number, number] = [25.7, 64.9]
const SOURCE = 'regions'
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * Choropleth of a geographic table over Finland's municipalities. One period
 * and one measure are shown at a time (chosen in the toolbar); the fill is a
 * sequential ramp across the current value range. Geometry comes from the WFS
 * service, joined to StatFin municipality codes by their bare digits.
 */
function MapView({ cube, theme }: Props) {
  const container = useRef<HTMLDivElement>(null)
  // The map whose style has finished loading, or null while none has. A theme
  // switch replaces the map, and data pushed into it before its new style
  // loads would throw ("Style is not done loading"), so only a map that has
  // fired `load` is ever stored here.
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [geo, setGeo] = useState<FeatureCollection | null>(null)
  const [geoFailed, setGeoFailed] = useState(false)

  // App renders MapView only for a cube with a geographic dimension.
  const geoDim = cube.dims.find((d) => d.id === cube.geoDim)!
  const timeDim = cube.dims.find((d) => d.id === cube.timeDim)
  const metricDim = cube.dims.find((d) => d.id === cube.metricDim)

  // The toolbar picks outlive a requery only while the new cube still has
  // them; otherwise fall back to the latest period and the first measure.
  const [periodPick, setPeriod] = useState('')
  const [measurePick, setMeasure] = useState('')
  const period = timeDim?.categories.some((c) => c.code === periodPick)
    ? periodPick
    : (timeDim?.categories.at(-1)?.code ?? '')
  const measure = metricDim?.categories.some((c) => c.code === measurePick)
    ? measurePick
    : (metricDim?.categories[0]?.code ?? '')

  // Load municipality polygons once.
  useEffect(() => {
    let cancelled = false
    fetchMunicipalities()
      .then((fc) => !cancelled && setGeo(fc))
      .catch(() => !cancelled && setGeoFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  // municipality code (bare digits) -> value, for the current period/measure.
  // Other areas in the dimension (the whole country, regions, sub-regions)
  // are skipped: they have no polygon and would stretch the colour ramp.
  const { values, min, max } = useMemo(() => {
    const pinned: Record<string, string> = {}
    for (const d of cube.dims) {
      if (d.id === geoDim.id) continue
      if (d.id === timeDim?.id) pinned[d.id] = period
      else if (d.id === metricDim?.id) pinned[d.id] = measure
      else pinned[d.id] = d.categories[0]?.code
    }
    const m = new Map<string, number>()
    let lo = Infinity
    let hi = -Infinity
    for (const rec of cube.records) {
      if (!Object.entries(pinned).every(([k, v]) => rec.key[k] === v)) continue
      if (rec.value == null) continue
      const code = municipalityCode(rec.key[geoDim.id])
      if (code == null) continue
      m.set(code, rec.value)
      lo = Math.min(lo, rec.value)
      hi = Math.max(hi, rec.value)
    }
    return { values: m, min: lo, max: hi }
  }, [cube, geoDim, timeDim, metricDim, period, measure])

  // Build a coloured GeoJSON: attach value, unit and fill colour to each
  // feature, so the hover popup reads everything from the feature itself.
  const coloured = useMemo(() => {
    if (!geo) return null
    const span = max - min || 1
    const features = geo.features.map((f) => {
      const code = municipalityCode(String(f.properties?.kunta ?? ''))
      const value = code == null ? undefined : values.get(code)
      const fill =
        value == null ? 'rgba(128,128,128,0.15)' : choroplethColor((value - min) / span)
      return {
        ...f,
        properties: {
          ...f.properties,
          _value: value ?? null,
          _unit: cube.unit,
          _fill: fill,
        },
      }
    })
    return { type: 'FeatureCollection', features } as FeatureCollection
  }, [geo, values, min, max, cube.unit])

  // Create the map, with its layers and hover popup, when the theme (basemap)
  // changes.
  useEffect(() => {
    if (!container.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLES[theme],
      center: FINLAND,
      zoom: 4.1,
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
        paint: { 'line-color': REGION_STROKE[theme], 'line-width': 0.4 },
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

  // Push the colouring into the loaded map whenever it changes.
  useEffect(() => {
    if (!map || !coloured) return
    ;(map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(coloured)
  }, [map, coloured])

  const fmt = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v))

  return (
    <div className="map-wrap">
      <div className="chart-toolbar">
        {timeDim && (
          <label className="mini-select">
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {timeDim.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {metricDim && metricDim.categories.length > 1 && (
          <label className="mini-select">
            Measure
            <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
              {metricDim.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {geoFailed && (
        <div className="error-row">Could not load the municipality boundaries from Statistics Finland.</div>
      )}
      <div className="map-canvas" ref={container} />

      {Number.isFinite(min) && Number.isFinite(max) && (
        <div className="legend">
          <span>{fmt(min)}</span>
          <div
            className="legend-ramp"
            style={{
              background: `linear-gradient(90deg, ${choroplethColor(0)}, ${choroplethColor(0.5)}, ${choroplethColor(1)})`,
            }}
          />
          <span>{fmt(max)}</span>
          <span className="legend-unit">{cube.unit}</span>
        </div>
      )}
      <p className="map-hint" style={{ borderColor: SERIES_COLORS[0] }}>
        Grey municipalities have no value for this selection. Geometry &amp; data ©
        Statistics Finland, CC BY 4.0.
      </p>
    </div>
  )
}

/**
 * Hover popup for one municipality. Built from DOM nodes rather than an HTML
 * string: the name and unit come from third-party responses, and text nodes
 * cannot be interpreted as markup.
 */
function popupContent(p: Record<string, unknown>): HTMLElement {
  const val = p._value == null ? '—' : new Intl.NumberFormat('en-US').format(Number(p._value))
  const el = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = String(p.name ?? p.nimi ?? '')
  el.append(name, document.createElement('br'), `${val} ${p._unit ?? ''}`)
  return el
}

export default MapView
