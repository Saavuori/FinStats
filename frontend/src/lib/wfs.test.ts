import { describe, expect, it } from 'vitest'
import { featureNumber, mapLevels, MAP_LEVELS, pickLevel } from './wfs'

const AREA = ['SSS', 'KU020', 'KU091', 'MK01', 'MK02', 'SK091', 'SA1', 'SA2', 'HVA01', 'HVA02', 'MA1']

describe('mapLevels', () => {
  it('finds every level with at least two areas, finest first', () => {
    const levels = mapLevels('alue_23_20260101', 'Area', AREA)
    expect(levels.map((l) => l.level.key)).toEqual(['KU', 'HVA', 'MK', 'SA'])
    expect(levels[0].areas).toEqual([
      { code: 'KU020', num: '20' },
      { code: 'KU091', num: '91' },
    ])
  })

  it('never joins a region or sub-region to the municipality sharing its digits', () => {
    const ku = mapLevels('alue', 'Area', AREA)[0]
    expect(ku.areas.map((a) => a.code)).not.toContain('SK091')
    expect(ku.areas.map((a) => a.code)).not.toContain('MK01')
  })

  it('reads bare codes as municipalities only in a municipality dimension', () => {
    const bare = ['020', '005', '091']
    expect(mapLevels('kunta_1_20150101', 'Municipality', bare)[0].level.key).toBe('KU')
    expect(mapLevels('Kunta', 'Kunta', bare)).toHaveLength(1)
    // "seutukunta" contains "kunta", but its numbers are sub-regions.
    expect(mapLevels('seutukunta', 'Sub-region', bare)).toEqual([])
    expect(mapLevels('alue', 'Area', bare)).toEqual([])
  })

  it('has nothing to draw for custom areas', () => {
    expect(mapLevels('alue_43', 'Region', ['SSS', 'pks', 'msu', 'kas'])).toEqual([])
  })

  it('maps ELY centres, whose numbers match the WFS layer', () => {
    const ely = mapLevels('Alue', 'Region', ['ELY01', 'ELY15', 'ELYJO'])
    expect(ely.map((l) => [l.level.key, l.areas.map((a) => a.num)])).toEqual([['ELY', ['1', '15']]])
  })
})

describe('pickLevel', () => {
  const levels = mapLevels('alue', 'Area', AREA)

  it('honours a requested level the table has', () => {
    expect(pickLevel(levels, [], 'MK')?.level.key).toBe('MK')
  })

  it('otherwise follows the current picks, else the finest level', () => {
    expect(pickLevel(levels, ['MK01', 'MK02', 'KU091'])?.level.key).toBe('MK')
    expect(pickLevel(levels, ['SSS'], 'nope')?.level.key).toBe('KU')
  })
})

describe('featureNumber', () => {
  it('reduces WFS codes to the same number as StatFin codes', () => {
    const kunta = MAP_LEVELS.find((l) => l.key === 'KU')!
    const suuralue = MAP_LEVELS.find((l) => l.key === 'SA')!
    expect(featureNumber(kunta, { kunta: '020' })).toBe('20')
    expect(featureNumber(suuralue, { suuralue: '1' })).toBe('1')
    expect(featureNumber(kunta, { kunta: '' })).toBeNull()
    expect(featureNumber(kunta, null)).toBeNull()
  })
})
