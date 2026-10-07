import { describe, expect, it } from 'vitest'
import { cubeToCsv } from './csv'
import { parseJsonStat } from './jsonstat'

describe('cubeToCsv', () => {
  const cube = parseJsonStat({
    id: ['alue', 'contentscode', 'vuosi'],
    size: [1, 2, 1],
    role: { time: ['vuosi'], metric: ['contentscode'] },
    dimension: {
      alue: { label: 'Area', category: { index: ['KU091'], label: { KU091: 'Helsinki, "capital"' } } },
      contentscode: {
        label: 'Information',
        category: {
          index: ['pop', 'share'],
          label: { pop: 'Population', share: 'Share, %' },
          unit: { pop: { base: 'number', decimals: 0 }, share: { base: 'per cent', decimals: 1 } },
        },
      },
      vuosi: { label: 'Year', category: { index: ['2025'], label: { 2025: '2025' } } },
    },
    value: [684018, null],
  })

  it('writes one tidy row per observation, codes beside labels', () => {
    const lines = cubeToCsv(cube).replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines).toEqual([
      'Area (code),Area,Information (code),Information,Year,Unit,Value',
      'KU091,"Helsinki, ""capital""",pop,Population,2025,number,684018',
      'KU091,"Helsinki, ""capital""",share,"Share, %",2025,%,',
    ])
  })

  it('starts with a byte-order mark so Excel reads UTF-8', () => {
    expect(cubeToCsv(cube).charCodeAt(0)).toBe(0xfeff)
  })
})
