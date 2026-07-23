// Theme identity shared by the CSS variables (stamped on <html data-theme>),
// the MapLibre basemap, and the choropleth colour ramp. Dark is the default;
// the choice is explicit and persisted — the OS setting is deliberately not
// read, matching the sibling apps (ratikka, bensa, tieliikenne).

export type Theme = 'dark' | 'light'

export const BASEMAP_STYLES: Record<Theme, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}

/** Outline drawn around choropleth polygons so borders stay legible. */
export const REGION_STROKE: Record<Theme, string> = {
  dark: 'rgba(255,255,255,0.25)',
  light: 'rgba(0,0,0,0.2)',
}

const STORAGE_KEY = 'finstats-theme'

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    // Private-mode / blocked storage — fall back to the default.
    return 'dark'
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* persistence is a nicety, not worth failing the toggle over */
  }
}
