// Municipality boundaries for the choropleth, from Statistics Finland's WFS
// service (geo.stat.fi). We fetch the generalised 1:4 500 000 layer as GeoJSON
// in WGS84 (EPSG:4326) so MapLibre can render it directly. CC BY 4.0.
//
// The join key: WFS features carry `kunta` as a 3-digit code ("020"); StatFin
// region codes are the same number prefixed with "KU" ("KU020"). normaliseCode
// reduces both to the bare digits.

import type { FeatureCollection } from 'geojson'

const WFS =
  'https://geo.stat.fi/geoserver/tilastointialueet/wfs' +
  '?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=tilastointialueet:kunta4500k' +
  '&outputFormat=application/json&srsName=EPSG:4326'

/** Reduce a StatFin region code or WFS kunta code to comparable bare digits. */
export function normaliseCode(code: string): string {
  const digits = code.replace(/\D/g, '')
  return digits.padStart(3, '0')
}

let cache: Promise<FeatureCollection> | null = null

/** Fetch (and memoise) the municipality polygons. */
export function fetchMunicipalities(): Promise<FeatureCollection> {
  if (!cache) {
    cache = fetch(WFS).then((res) => {
      if (!res.ok) throw new Error(`WFS returned ${res.status}`)
      return res.json() as Promise<FeatureCollection>
    })
  }
  return cache
}
