import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { Cube } from '../lib/jsonstat'
import { fetchMunicipalities, normaliseCode } from '../lib/wfs'
import { choroplethColor, SERIES_COLORS } from '../lib/palette'
import { BASEMAP_STYLES, REGION_STROKE, type Theme } from '../lib/theme'

interface Props {
  cube: Cube
  theme: Theme
}

const FINLAND: [number, number] = [25.7, 64.9]

/**
 * Choropleth of a geographic table over Finland's municipalities. One period
 * and one measure are shown at a time (chosen in the toolbar); the fill is a
 * sequential ramp across the current value range. Geometry comes from the WFS
 * service, joined to StatFin region codes by their bare digits.
 */
function MapView({ cube, theme }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [geo, setGeo] = useState<FeatureCollection | null>(null)
  const [ready, setReady] = useState(false)

  const geoDim = cube.dims.find((d) => d.id === cube.geoDim)!
  const timeDim = cube.dims.find((d) => d.id === cube.timeDim)
  const metricDim = cube.dims.find((d) => d.id === cube.metricDim)

  const [period, setPeriod] = useState(
    timeDim?.categories[timeDim.categories.length - 1]?.code ?? '',
  )
  const [measure, setMeasure] = useState(metricDim?.categories[0]?.code ?? '')

  // Load municipality polygons once.
  useEffect(() => {
    let cancelled = false
    fetchMunicipalities()
      .then((fc) => !cancelled && setGeo(fc))
      .catch(() => !cancelled && setGeo(null))
    return () => {
      cancelled = true
    }
  }, [])

  // region code (bare digits) -> value, for the current period/measure.
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
      m.set(normaliseCode(rec.key[geoDim.id]), rec.value)
      lo = Math.min(lo, rec.value)
      hi = Math.max(hi, rec.value)
    }
    return { values: m, min: lo, max: hi }
  }, [cube, geoDim, timeDim, metricDim, period, measure])

  // Build a coloured GeoJSON: attach value + fill colour to each feature.
  const coloured = useMemo(() => {
    if (!geo) return null
    const span = max - min || 1
    const features = geo.features.map((f) => {
      const code = normaliseCode(String(f.properties?.kunta ?? ''))
      const value = values.get(code)
      const fill =
        value == null ? 'rgba(128,128,128,0.15)' : choroplethColor((value - min) / span)
      return {
        ...f,
        properties: {
          ...f.properties,
          _value: value ?? null,
          _fill: fill,
        },
      }
    })
    return { type: 'FeatureCollection', features } as FeatureCollection
  }, [geo, values, min, max])

  // Create the map when the theme (basemap) changes.
  useEffect(() => {
    if (!container.current) return
    setReady(false)
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLES[theme],
      center: FINLAND,
      zoom: 4.1,
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => setReady(true))
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [theme])

  // Push data into the map once it's ready and whenever the colouring changes.
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !coloured) return

    const SRC = 'regions'
    const existing = m.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (existing) {
      existing.setData(coloured)
      return
    }

    m.addSource(SRC, { type: 'geojson', data: coloured })
    m.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: SRC,
      paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': 0.85 },
    })
    m.addLayer({
      id: 'region-line',
      type: 'line',
      source: SRC,
      paint: { 'line-color': REGION_STROKE[theme], 'line-width': 0.4 },
    })

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    m.on('mousemove', 'region-fill', (e: maplibregl.MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = 'pointer'
      const p = e.features?.[0]?.properties
      if (!p) return
      const val = p._value == null ? '—' : new Intl.NumberFormat('en-US').format(Number(p._value))
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${p.name ?? p.nimi}</strong><br/>${val} ${cube.unit}`)
        .addTo(m)
    })
    m.on('mouseleave', 'region-fill', () => {
      m.getCanvas().style.cursor = ''
      popup.remove()
    })
  }, [ready, coloured, theme, cube.unit])

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

export default MapView
