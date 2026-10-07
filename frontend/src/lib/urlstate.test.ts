import { describe, expect, it } from 'vitest'
import { readUrl, resolveSelections, selectionDiff, writeUrl, type ExplorerState } from './urlstate'
import type { TableMeta, Variable } from '../types'

const variable = (code: string, codes: string[], extra: Partial<Variable> = {}): Variable => ({
  code,
  label: code,
  values: codes.map((c) => ({ code: c, label: c })),
  time: false,
  content: false,
  elimination: false,
  ...extra,
})

const meta: TableMeta = {
  title: 'Key figures',
  variables: [
    variable('alue', ['SSS', 'KU091', 'KU837']),
    variable('contentscode', ['pop', 'age'], { content: true }),
    variable('vuosi', ['2023', '2024', '2025'], { time: true }),
  ],
}

describe('readUrl / writeUrl', () => {
  it('round-trips a full state', () => {
    const state: ExplorerState = {
      table: 'vaerak/11ra.px',
      view: 'map',
      kind: 'bar',
      x: 'alue',
      level: 'MK',
      sel: { alue: ['KU091', 'KU837'], contentscode: '*' },
    }
    expect(readUrl(writeUrl(state))).toEqual(state)
  })

  it('keeps the table path readable', () => {
    expect(writeUrl({ table: 'vaerak/11ra.px', view: 'chart', sel: {} })).toBe('?table=vaerak/11ra.px')
  })

  it('escapes codes holding the separator, spaces or "*"', () => {
    const state: ExplorerState = {
      table: 't/x.px',
      view: 'chart',
      sel: { 'Työllisyyskoodin kesto': ['a,b', '*', '50-'] },
    }
    const url = writeUrl(state)
    expect(url).not.toContain('a,b')
    expect(readUrl(url)?.sel).toEqual(state.sel)
  })

  it('returns null without a table and defaults unknown values', () => {
    expect(readUrl('')).toBeNull()
    expect(readUrl('?view=map')).toBeNull()
    expect(readUrl('?table=a/b.px&view=nonsense&chart=pie')).toEqual({
      table: 'a/b.px',
      view: 'chart',
      kind: undefined,
      x: undefined,
      level: undefined,
      sel: {},
    })
  })

  it('survives malformed percent-encoding', () => {
    expect(readUrl('?table=a/b.px&s.alue=%E0%A4%A')?.sel).toEqual({ alue: ['%E0%A4%A'] })
  })
})

describe('selections', () => {
  it('omits picks that equal the defaults', () => {
    const defaults = resolveSelections(meta, {})
    expect(defaults).toEqual({ alue: ['SSS'], contentscode: ['pop'], vuosi: ['2023', '2024', '2025'] })
    expect(selectionDiff(meta, defaults)).toEqual({})
  })

  it('writes "every value" as *', () => {
    const sel = { ...resolveSelections(meta, {}), contentscode: ['pop', 'age'] }
    expect(selectionDiff(meta, sel)).toEqual({ contentscode: '*' })
  })

  it('drops unknown codes, restores table order and falls back to defaults', () => {
    expect(
      resolveSelections(meta, { alue: ['KU837', 'nope', 'KU091'], contentscode: ['gone'] }),
    ).toEqual({ alue: ['KU091', 'KU837'], contentscode: ['pop'], vuosi: ['2023', '2024', '2025'] })
  })
})
