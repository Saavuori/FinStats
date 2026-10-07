// Chart and map colours: the validated data-viz palette the sibling apps share
// (bensa's fuels use the same hexes). Each categorical slot is one hue stepped
// separately for the light and dark surface — never an automatic flip — and
// the slot order is the colourblind-safety mechanism, so it is never reshuffled.
// Validated with the data-viz validator against this app's surfaces
// (#fcfcfb light, #1a1a19 dark): worst adjacent CVD ΔE 9.1 light / 8.4 dark,
// normal-vision ΔE ≥ 19.3. Three light slots sit below 3:1 contrast, which is
// why every chart has a Table view twin.

import type { Theme } from './theme'

const SERIES: Record<Theme, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

/**
 * A chart carries at most this many series. A ninth would need a generated or
 * reused hue, which colourblind readers can't tell from an existing one; the
 * rest stay reachable in the Table view.
 */
export const MAX_SERIES = SERIES.light.length

/** Colour of categorical slot `slot` (0-based, < MAX_SERIES). */
export function seriesColor(slot: number, theme: Theme): string {
  return SERIES[theme][slot] ?? SERIES[theme][0]
}

/**
 * Sequential blue ramp, steps 100–700, for the choropleth. One hue,
 * light -> dark; in the dark theme the anchor flips so "more" is the step
 * furthest from the surface either way.
 */
const SEQUENTIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']

/** Past seven classes adjacent colours blur together; the table carries more. */
export const MAX_CLASSES = SEQUENTIAL.length

/** Fill colours for `count` ordered classes (lowest first), spread over the ramp. */
export function classColors(count: number, theme: Theme): string[] {
  const n = Math.max(1, Math.min(count, MAX_CLASSES))
  // A lone class takes the mid step, which reads on either surface.
  if (n === 1) return [SEQUENTIAL[3]]
  const steps = Array.from(
    { length: n },
    (_, i) => SEQUENTIAL[Math.round((i * (MAX_CLASSES - 1)) / (n - 1))],
  )
  return theme === 'dark' ? steps.reverse() : steps
}
