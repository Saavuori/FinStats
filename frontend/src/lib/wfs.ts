// Area boundaries for the choropleth, from Statistics Finland's WFS service
// (geo.stat.fi). Each map level is one generalised 1:4 500 000 layer, fetched
// as GeoJSON in WGS84 (EPSG:4326) so MapLibre can render it directly. CC BY 4.0.
//
// The join key: a StatFin area code is a level prefix plus a number ("KU020",
// "MK01", "SA1"), and the matching WFS layer carries the same number in a
// property of its own ("kunta": "020", "maakunta": "01", "suuralue": "1").
// Both sides are reduced to the plain number.

import type { FeatureCollection } from 'geojson'

export interface MapLevel {
  /** StatFin code prefix; also names the level in the URL. */
  key: string
  label: string
  /** WFS layer (tilastointialueet:<layer>) and the property holding the number. */
  layer: string
  prop: string
  pattern: RegExp
}

/** Finest first, so the default map is the most detailed one a table allows. */
export const MAP_LEVELS: MapLevel[] = [
  { key: 'KU', label: 'Municipalities', layer: 'kunta4500k', prop: 'kunta', pattern: /^KU(\d{3})$/ },
  { key: 'SK', label: 'Sub-regions', layer: 'seutukunta4500k', prop: 'seutukunta', pattern: /^SK(\d{3})$/ },
  { key: 'HVA', label: 'Wellbeing services counties', layer: 'hyvinvointialue4500k', prop: 'hyvinvointialue', pattern: /^HVA(\d{2})$/ },
  { key: 'MK', label: 'Regions', layer: 'maakunta4500k', prop: 'maakunta', pattern: /^MK(\d{2})$/ },
  { key: 'EVK', label: 'Economic development centres', layer: 'elinvoimakeskus4500k', prop: 'elinvoimakeskus', pattern: /^EVK(\d{2})$/ },
  // Replaced by the economic development centres in 2026; older tables keep them.
  { key: 'ELY', label: 'ELY centres', layer: 'ely4500k', prop: 'ely', pattern: /^ELY(\d{2})$/ },
  { key: 'VP', label: 'Electoral districts', layer: 'vaalipiiri4500k', prop: 'vaalipiiri', pattern: /^VP(\d{2})$/ },
  { key: 'SA', label: 'Major regions', layer: 'suuralue4500k', prop: 'suuralue', pattern: /^SA(\d)$/ },
]

// Some municipality tables use the bare code ("020" rather than "KU020"). Bare
// numbers are only trusted in a dimension that says it holds municipalities:
// sub-region numbers overlap them ("091" is Helsinki, but also a sub-region),
// and "maakunta"/"seutukunta" contain "kunta", hence the anchors.
const MUNICIPAL = /^kunta|municipalit|^kommun/i
const BARE_MUNICIPALITY = /^(\d{3})$/

/** The areas of one level found in a dimension, with their join numbers. */
export interface LevelAreas {
  level: MapLevel
  areas: { code: string; num: string }[]
}

/**
 * Which map levels a geographic dimension can be drawn at. A dimension often
 * mixes levels (the whole country, regions, municipalities…); a level counts
 * once it has two areas — one polygon is not a map. Areas keep the input order.
 */
export function mapLevels(dimCode: string, dimLabel: string, codes: string[]): LevelAreas[] {
  const municipal = MUNICIPAL.test(dimCode) || MUNICIPAL.test(dimLabel)
  const found: LevelAreas[] = []
  for (const level of MAP_LEVELS) {
    const areas: LevelAreas['areas'] = []
    for (const code of codes) {
      const m =
        level.pattern.exec(code) ??
        (municipal && level.key === 'KU' ? BARE_MUNICIPALITY.exec(code) : null)
      if (m) areas.push({ code, num: String(Number(m[1])) })
    }
    if (areas.length >= 2) found.push({ level, areas })
  }
  return found
}

/**
 * The level to draw: the requested one if the table has it, else the one most
 * of the current selection belongs to, else the finest available.
 */
export function pickLevel(
  levels: LevelAreas[],
  selected: string[],
  requested?: string,
): LevelAreas | undefined {
  const asked = levels.find((l) => l.level.key === requested)
  if (asked) return asked
  const picked = new Set(selected)
  let best: LevelAreas | undefined
  let bestCount = 0
  for (const l of levels) {
    const count = l.areas.filter((a) => picked.has(a.code)).length
    if (count > bestCount) [best, bestCount] = [l, count]
  }
  return best ?? levels[0]
}

/** The join number of a WFS feature at `level` ("020" -> "20"). */
export function featureNumber(level: MapLevel, properties: Record<string, unknown> | null): string | null {
  const raw = properties?.[level.prop]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? String(n) : null
}

const WFS = 'https://geo.stat.fi/geoserver/tilastointialueet/wfs'

const cache = new Map<string, Promise<FeatureCollection>>()

/** Fetch (and memoise) the polygons of one map level. */
export function fetchBoundaries(level: MapLevel): Promise<FeatureCollection> {
  let pending = cache.get(level.layer)
  if (!pending) {
    const url =
      `${WFS}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=tilastointialueet:${level.layer}` +
      '&outputFormat=application/json&srsName=EPSG:4326'
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`WFS returned ${res.status}`)
      return res.json() as Promise<FeatureCollection>
    })
    // Forget a failed fetch, so the next map mount retries instead of reusing
    // the rejection for the rest of the session.
    pending.catch(() => cache.delete(level.layer))
    cache.set(level.layer, pending)
  }
  return pending
}
