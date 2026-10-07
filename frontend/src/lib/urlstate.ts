// The explorer's state lives in the URL, so any view can be bookmarked,
// shared, reloaded and stepped through with Back/Forward:
//
//   ?table=vaerak/11ra.px&view=map&s.alue_23_20260101=KU837,KU091&s.contentscode=*
//
// Only picks that differ from the table's default are written, which keeps
// links short — and a link that never touched the periods keeps showing the
// latest ones as Statistics Finland publishes new data.

import { defaultSelection } from './pxweb'
import type { TableMeta } from '../types'

export type View = 'chart' | 'map' | 'table'
export type ChartKind = 'line' | 'bar'

export interface ExplorerState {
  /** The table's reference, "vaerak/11ra.px". */
  table: string
  view: View
  /** Chart form and x-axis dimension; unset means "choose automatically". */
  kind?: ChartKind
  x?: string
  /** Map level key ("KU", "MK"…); unset means "choose automatically". */
  level?: string
  /** Picks per variable code, '*' meaning every value. */
  sel: Record<string, string[] | '*'>
}

// Codes may hold anything, so each is percent-encoded, with "," left free to
// separate them. "/" stays readable in the table path; "*" is escaped because
// on its own it means "all".
function enc(text: string): string {
  return encodeURIComponent(text).replace(/\*/g, '%2A').replace(/%2F/gi, '/')
}

function dec(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** Parse a location.search string; null when it names no table. */
export function readUrl(search: string): ExplorerState | null {
  const raw = new Map<string, string>()
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    raw.set(dec(eq < 0 ? part : part.slice(0, eq)), eq < 0 ? '' : part.slice(eq + 1))
  }
  const table = dec(raw.get('table') ?? '')
  if (!table) return null

  const view = dec(raw.get('view') ?? '')
  const kind = dec(raw.get('chart') ?? '')
  const sel: ExplorerState['sel'] = {}
  for (const [key, value] of raw) {
    if (!key.startsWith('s.') || key.length < 3) continue
    sel[key.slice(2)] = value === '*' ? '*' : value.split(',').filter(Boolean).map(dec)
  }
  return {
    table,
    view: view === 'map' || view === 'table' ? view : 'chart',
    kind: kind === 'line' || kind === 'bar' ? kind : undefined,
    x: raw.has('x') ? dec(raw.get('x')!) : undefined,
    level: raw.has('level') ? dec(raw.get('level')!) : undefined,
    sel,
  }
}

/** The location.search string for a state (always starts with "?"). */
export function writeUrl(state: ExplorerState): string {
  const parts = [`table=${enc(state.table)}`]
  if (state.view !== 'chart') parts.push(`view=${state.view}`)
  if (state.kind) parts.push(`chart=${state.kind}`)
  if (state.x) parts.push(`x=${enc(state.x)}`)
  if (state.level) parts.push(`level=${enc(state.level)}`)
  for (const [code, values] of Object.entries(state.sel)) {
    parts.push(`s.${enc(code)}=${values === '*' ? '*' : values.map(enc).join(',')}`)
  }
  return `?${parts.join('&')}`
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The picks worth writing down: those that differ from the table's default. */
export function selectionDiff(
  meta: TableMeta,
  selections: Record<string, string[]>,
): ExplorerState['sel'] {
  const diff: ExplorerState['sel'] = {}
  for (const v of meta.variables) {
    const picked = selections[v.code] ?? []
    if (same(picked, defaultSelection(v))) continue
    diff[v.code] = v.values.length > 1 && picked.length === v.values.length ? '*' : picked
  }
  return diff
}

/**
 * Full selections for a table from a URL's picks: unknown codes are dropped,
 * picks keep the table's value order, and a variable left with nothing gets
 * its default.
 */
export function resolveSelections(
  meta: TableMeta,
  sel: ExplorerState['sel'],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const v of meta.variables) {
    const want = sel[v.code]
    const picked =
      want === '*'
        ? v.values.map((x) => x.code)
        : v.values.filter((x) => want?.includes(x.code)).map((x) => x.code)
    out[v.code] = picked.length ? picked : defaultSelection(v)
  }
  return out
}
