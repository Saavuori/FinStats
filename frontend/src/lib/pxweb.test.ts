import { describe, expect, it } from 'vitest'
import { dedupeHits, defaultSelection, looksLikeRegion, tableRef, type SearchHit } from './pxweb'
import type { Variable } from '../types'

const variable = (code: string, label: string, codes: string[], time = false): Variable => ({
  code,
  label,
  values: codes.map((c) => ({ code: c, label: c })),
  time,
  content: false,
  elimination: false,
})

describe('looksLikeRegion', () => {
  it('recognises area dimensions however StatFin names them', () => {
    expect(looksLikeRegion('alue_23_20260101', 'Area', ['SSS'])).toBe(true)
    expect(looksLikeRegion('kunta_1_20150101', 'Municipality', ['020'])).toBe(true)
    expect(looksLikeRegion('Alue', 'Region', ['SSS', 'KU020'])).toBe(true)
    expect(looksLikeRegion('alue_16', 'Major regions 2012', ['SSS', 'SA1'])).toBe(true)
    expect(looksLikeRegion('x', 'Wellbeing services county', ['HVA01'])).toBe(true)
  })

  it('leaves other dimensions alone', () => {
    expect(looksLikeRegion('talotyyppi', 'Building type', ['0', '1', '3'])).toBe(false)
    expect(looksLikeRegion('koulutusala', 'Area of education', ['01'])).toBe(false)
  })
})

describe('defaultSelection', () => {
  it('opens on enough periods to show a trend', () => {
    const months = Array.from(
      { length: 212 },
      (_, i) => `${2009 + Math.floor(i / 12)}M${String((i % 12) + 1).padStart(2, '0')}`,
    )
    expect(defaultSelection(variable('timeperiod_m', 'Month', months, true))).toHaveLength(60)
    expect(defaultSelection(variable('timeperiod_m', 'Month', months, true)).at(-1)).toBe(months.at(-1))
    const quarters = Array.from({ length: 100 }, (_, i) => `${2000 + Math.floor(i / 4)}Q${(i % 4) + 1}`)
    expect(defaultSelection(variable('q', 'Quarter', quarters, true))).toHaveLength(40)
    const years = Array.from({ length: 276 }, (_, i) => String(1750 + i))
    expect(defaultSelection(variable('vuosi', 'Year', years, true))).toHaveLength(30)
  })

  it('prefers the whole country, then Helsinki, for areas', () => {
    expect(defaultSelection(variable('alue', 'Area', ['KU020', 'SSS']))).toEqual(['SSS'])
    expect(defaultSelection(variable('kunta', 'Municipality', ['020', '091']))).toEqual(['091'])
    expect(defaultSelection(variable('sex', 'Sex', ['SSS', '1', '2']))).toEqual(['SSS'])
  })
})

describe('search helpers', () => {
  it('keeps one copy of a table published under several statistics', () => {
    const hit = (path: string, id: string, title: string): SearchHit => ({ path, id, title, score: 1 })
    const hits = [
      hit('/synt', '12dx.px', '12dx -- Vital statistics and population, 1749-2025'),
      hit('/kuol', '12at.px', '12at -- Vital statistics and population, 1749-2025'),
      hit('/vaerak', '11ra.px', '11ra -- Key figures on population'),
    ]
    expect(dedupeHits(hits).map((h) => h.id)).toEqual(['12dx.px', '11ra.px'])
  })

  it('builds table references from search and browse paths', () => {
    expect(tableRef('/vaerak', '11ra.px')).toBe('vaerak/11ra.px')
    expect(tableRef('vaerak/', '11ra.px')).toBe('vaerak/11ra.px')
    expect(tableRef('', '11ra.px')).toBe('11ra.px')
  })
})
