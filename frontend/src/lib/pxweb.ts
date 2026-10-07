// Client for the Statistics Finland PxWeb API (v1).
//
// Docs: https://pxdata.stat.fi/api1.html
// - Navigate the tree with GET requests, one level at a time.
// - GET a table URL returns its metadata (variables + valid values).
// - POST a selection to the same URL returns the data (we ask for json-stat2).
//
// The API sends CORS headers, so this all runs in the browser with no proxy.
// Limits worth respecting (from the ?config endpoint): 120 000 cells per
// query, 40 calls / 60 s. We keep queries small and debounce the UI.

import type { DbNode, TableMeta, Variable } from '../types'
import type { RawJsonStat } from './jsonstat'

const ROOT = 'https://pxdata.stat.fi/PxWeb/api/v1'

export type Lang = 'en' | 'fi' | 'sv'

/** Which database to browse. StatFin is the main open collection. */
export const DATABASE = 'StatFin'

function base(lang: Lang): string {
  return `${ROOT}/${lang}/${DATABASE}`
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Statistics Finland API returned ${res.status} for ${url}`)
  }
  return res.json() as Promise<T>
}

/**
 * List the children of a database path. `path` is the slash-joined folder ids,
 * e.g. "" for the top level or "vaerak" for a subject folder. Tables come back
 * with `type: "t"` and an id ending in ".px".
 */
export function browse(lang: Lang, path: string): Promise<DbNode[]> {
  const url = path ? `${base(lang)}/${path}/` : `${base(lang)}/`
  // The tree barely changes within a session, and both the browser and the
  // landing page's release feed need the top level — cache to save calls.
  let hit = browseCache.get(url)
  if (!hit) {
    hit = getJSON<DbNode[]>(url)
    browseCache.set(url, hit)
    hit.catch(() => browseCache.delete(url))
  }
  return hit
}

const browseCache = new Map<string, Promise<DbNode[]>>()

/** Free-text search result row from the `?query=` endpoint. */
export interface SearchHit {
  id: string
  path: string
  title: string
  score: number
  published?: string
}

/**
 * Full-text search across the whole StatFin database. Returns tables ranked by
 * relevance; `path` is the folder the table lives in (used to build its URL).
 */
export async function search(lang: Lang, query: string): Promise<SearchHit[]> {
  // Free-text search takes `query` alone. Passing `filter=*` (valid when
  // listing the tree) makes the text search return nothing, so it's omitted.
  const url = `${base(lang)}/?query=${encodeURIComponent(query)}`
  const hits = await getJSON<SearchHit[]>(url)
  return hits.slice(0, 60)
}

/**
 * Tables with their publish dates, for the "latest releases" feed. PxWeb v1
 * has no "recently updated" listing, and walking the tree costs one call per
 * subject (~135, far over the 40-call budget). But nearly every table title
 * ends in the period it covers ("…, 1990-2025", "…, 2009M01-2026M08"), and the
 * search ORs its terms — so one query for the last three years plus the
 * period words returns almost the whole live database (~1 400 of ~1 500
 * tables, ~270 kB) with `published` dates. Tables that stopped updating years
 * ago are the ones it misses, which a "latest" feed doesn't want anyway.
 */
export function recentTables(lang: Lang): Promise<SearchHit[]> {
  // Cached for the session, like the tree: going back to the landing page
  // shouldn't spend another call on a 270 kB list.
  let hit = recentCache.get(lang)
  if (!hit) {
    const y = new Date().getFullYear()
    const terms = [y - 2, y - 1, y, 'month', 'monthly', 'quarter', 'quarterly', 'annual', 'week']
    hit = getJSON<SearchHit[]>(`${base(lang)}/?query=${encodeURIComponent(terms.join(' '))}`)
    recentCache.set(lang, hit)
    hit.catch(() => recentCache.delete(lang))
  }
  return hit
}

const recentCache = new Map<Lang, Promise<SearchHit[]>>()

/** Build the fully-qualified URL of a table from its folder path and id. */
export function tableUrl(lang: Lang, path: string, id: string): string {
  const clean = path.replace(/^\/|\/$/g, '')
  return `${base(lang)}/${clean}/${id}`
}

/** Is this variable the time dimension? PxWeb marks it explicitly. */
function isTime(v: { code: string; time?: boolean }): boolean {
  return v.time === true || /(^|_)(time|vuosi|year|kuukausi|month|quarter)/i.test(v.code)
}

/** Is this the "contents" variable that carries the measured quantities? */
function isContent(v: { code: string; text: string }): boolean {
  return (
    v.code.toLowerCase() === 'contentscode' ||
    /^(tiedot|information|uppgifter)$/i.test(v.text)
  )
}

/**
 * Does a variable hold geographic areas we can put on the map? The one region
 * heuristic for both the table metadata (which enables the Map tab) and the
 * json-stat cube (which MapView draws), so the two can never disagree.
 */
export function looksLikeRegion(code: string, label: string, valueCodes: string[]): boolean {
  return (
    /^alue/i.test(code) ||
    /^(area|alue|område)$/i.test(label) ||
    valueCodes.some((c) => /^(KU|MK|SK|MA)\d/.test(c))
  )
}

export function isRegion(v: Variable): boolean {
  return looksLikeRegion(v.code, v.label, v.values.map((val) => val.code))
}

interface RawMeta {
  title: string
  variables: {
    code: string
    text: string
    values: string[]
    valueTexts: string[]
    time?: boolean
    elimination?: boolean
  }[]
}

/** Fetch and normalise a table's metadata. */
export async function getMeta(url: string): Promise<TableMeta> {
  const raw = await getJSON<RawMeta>(url)
  const variables: Variable[] = raw.variables.map((v) => ({
    code: v.code,
    label: v.text,
    time: isTime(v),
    content: isContent(v),
    elimination: v.elimination === true,
    values: v.values.map((code, i) => ({
      code,
      label: v.valueTexts[i] ?? code,
    })),
  }))
  return { title: raw.title, variables }
}

/** One entry of the POST body's `query` array. */
interface QueryItem {
  code: string
  selection: { filter: 'item'; values: string[] }
}

/**
 * POST a selection and get back a json-stat2 dataset. `selections` maps a
 * variable code to the value codes to include; a variable with no values is
 * left out of the query, which PxWeb only accepts for eliminable variables —
 * the caller waits until every variable has a pick before querying.
 */
export async function queryTable(
  url: string,
  selections: Record<string, string[]>,
): Promise<RawJsonStat> {
  const query: QueryItem[] = Object.entries(selections)
    .filter(([, values]) => values.length > 0)
    .map(([code, values]) => ({
      code,
      selection: { filter: 'item', values },
    }))

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
  })

  if (res.status === 403) {
    throw new Error('Query too large — narrow the selection (max 120 000 values).')
  }
  if (res.status === 429) {
    throw new Error('Too many requests to Statistics Finland — wait a moment and retry.')
  }
  if (!res.ok) {
    throw new Error(`Statistics Finland API returned ${res.status}. Check the selection.`)
  }
  return res.json() as Promise<RawJsonStat>
}
