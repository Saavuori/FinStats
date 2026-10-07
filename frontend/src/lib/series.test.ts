import { describe, expect, it } from 'vitest'
import { assignSlots, buildChart, panelize } from './series'
import { parseJsonStat, type RawJsonStat } from './jsonstat'

/** A json-stat2 dataset: dims listed in order, values row-major. */
function cube(dims: [string, string[]][], value: (number | null)[], units?: Record<string, string>) {
  const raw: RawJsonStat = {
    label: 'Test',
    id: dims.map(([id]) => id),
    size: dims.map(([, codes]) => codes.length),
    role: { time: ['vuosi'], metric: ['contentscode'], geo: ['alue'] },
    dimension: Object.fromEntries(
      dims.map(([id, codes]) => [
        id,
        {
          label: id,
          category: {
            index: codes,
            label: Object.fromEntries(codes.map((c) => [c, `${c}!`])),
            ...(id === 'contentscode' && units
              ? { unit: Object.fromEntries(Object.entries(units).map(([c, base]) => [c, { base, decimals: 1 }])) }
              : {}),
          },
        },
      ]),
    ),
    value,
  }
  return parseJsonStat(raw)
}

describe('buildChart', () => {
  it('puts time on x and turns every other multi-valued dimension into series', () => {
    const c = cube(
      [
        ['alue', ['A', 'B']],
        ['contentscode', ['pop']],
        ['sex', ['m', 'f']],
        ['vuosi', ['2024', '2025']],
      ],
      // alue × contentscode × sex × vuosi, last fastest
      [1, 2, 3, 4, 5, 6, 7, 8],
      { pop: 'number' },
    )
    const m = buildChart(c)
    expect(m.x.id).toBe('vuosi')
    expect(m.fixed.map((f) => f.dim.id)).toEqual(['contentscode'])
    expect(m.series.map((s) => s.label)).toEqual(['A! · m!', 'A! · f!', 'B! · m!', 'B! · f!'])
    expect(m.rows.map((r) => r.values)).toEqual([
      [1, 3, 5, 7],
      [2, 4, 6, 8],
    ])
  })

  it('names a lone series after its measure', () => {
    const c = cube([['contentscode', ['pop']], ['vuosi', ['2024', '2025']]], [1, 2], { pop: 'number' })
    const m = buildChart(c)
    expect(m.series).toHaveLength(1)
    expect(m.series[0].label).toBe('pop!')
    expect(m.series[0].unit.label).toBe('number')
  })

  it('falls back to the widest non-measure dimension when time has one value', () => {
    const c = cube(
      [
        ['alue', ['A', 'B', 'C']],
        ['contentscode', ['pop', 'age']],
        ['vuosi', ['2025']],
      ],
      [1, 2, 3, 4, 5, 6],
    )
    expect(buildChart(c).x.id).toBe('alue')
    expect(buildChart(c, 'contentscode').x.id).toBe('contentscode')
  })

  it('gives each series the unit of its measure', () => {
    const c = cube(
      [
        ['contentscode', ['pop', 'share']],
        ['vuosi', ['2024', '2025']],
      ],
      [1, 2, 3, 4],
      { pop: 'number', share: 'per cent' },
    )
    expect(buildChart(c).series.map((s) => s.unit.label)).toEqual(['number', '%'])
  })
})

describe('panelize', () => {
  it('facets by measure and colours by area when every unit holds one measure', () => {
    const c = cube(
      [
        ['alue', ['A', 'B']],
        ['contentscode', ['pop', 'age']],
        ['vuosi', ['2024', '2025']],
      ],
      [1, 2, 3, 4, 5, 6, 7, 8],
      { pop: 'number', age: 'years' },
    )
    const m = buildChart(c)
    const { panels, identities } = panelize(m, m.series, c.metricDim)
    expect(panels.map((p) => [p.unit.label, p.measure, p.members])).toEqual([
      ['number', 'pop!', [0, 2]],
      ['years', 'age!', [1, 3]],
    ])
    expect(identities.map((i) => i.label)).toEqual(['A!', 'A!', 'B!', 'B!'])
  })

  it('keeps full series identities when a panel mixes measures', () => {
    const c = cube(
      [
        ['alue', ['A']],
        ['contentscode', ['fi', 'sv']],
        ['vuosi', ['2024', '2025']],
      ],
      [1, 2, 3, 4],
      { fi: '%', sv: '%' },
    )
    const m = buildChart(c)
    const { panels, identities } = panelize(m, m.series, c.metricDim)
    expect(panels).toHaveLength(1)
    expect(identities.map((i) => i.key)).toEqual(['fi', 'sv'])
  })
})

describe('assignSlots', () => {
  it('assigns in order, then keeps survivors in place', () => {
    const first = assignSlots(new Map(), ['a', 'b', 'c'], 8)
    expect([...first]).toEqual([['a', 0], ['b', 1], ['c', 2]])
    // "a" leaves, "d" arrives: b and c keep their colours, d takes the free slot.
    const next = assignSlots(first, ['b', 'c', 'd'], 8)
    expect([...next]).toEqual([['b', 1], ['c', 2], ['d', 0]])
  })
})
