// Municipality boundaries for the choropleth, from Statistics Finland's WFS
// service (geo.stat.fi). We fetch the generalised 1:4 500 000 layer as GeoJSON
// in WGS84 (EPSG:4326) so MapLibre can render it directly. CC BY 4.0.
//
// The join key: WFS features carry `kunta` as a 3-digit code ("020"); StatFin
// municipality codes are the same number prefixed with "KU" ("KU020").
// municipalityCode reduces both to the bare digits.

import type { FeatureCollection } from 'geojson'

const WFS =
  'https://geo.stat.fi/geoserver/tilastointialueet/wfs' +
  '?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=tilastointialueet:kunta4500k' +
  '&outputFormat=application/json&srsName=EPSG:4326'

/**
 * The bare 3-digit municipality code of a StatFin region code ("KU020") or a
 * WFS kunta code ("020"), or null for anything that isn't a municipality. A
 * region dimension also holds the whole country ("SSS") and larger areas whose
 * codes carry the same digits ("MK05" is a region, "SK091" a sub-region); those
 * must not be joined to municipality 005 or 091.
 */
export function municipalityCode(code: string): string | null {
  const m = /^(?:KU)?(\d{1,3})$/.exec(code)
  return m ? m[1].padStart(3, '0') : null
}

let cache: Promise<FeatureCollection> | null = null

/** Fetch (and memoise) the municipality polygons. */
export function fetchMunicipalities(): Promise<FeatureCollection> {
  if (!cache) {
    cache = fetch(WFS).then((res) => {
      if (!res.ok) throw new Error(`WFS returned ${res.status}`)
      return res.json() as Promise<FeatureCollection>
    })
    // Forget a failed fetch, so the next map mount retries instead of reusing
    // the rejection for the rest of the session.
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}
