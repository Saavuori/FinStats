// Categorical series colours and the sequential ramp for the choropleth.
// These are the validated, colourblind-safe hues used across the sibling
// data-viz apps; the order is fixed so a given series keeps its colour.

export const SERIES_COLORS = [
  '#3987e5', // blue
  '#e6994d', // orange
  '#3aa76d', // green
  '#c65f8e', // magenta
  '#8a6fd6', // purple
  '#d1a730', // gold
  '#4bb3c4', // teal
  '#d4635f', // coral
]

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

/**
 * Sequential ramp (light -> saturated blue) for choropleth fills. `t` is the
 * value's position in [0,1] within the current data range. Interpolates in
 * sRGB, which is good enough for a single-hue ramp.
 */
export function choroplethColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  // Low end: pale blue-grey. High end: deep accent blue.
  const from = [222, 235, 247]
  const to = [8, 74, 145]
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * clamped))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}
