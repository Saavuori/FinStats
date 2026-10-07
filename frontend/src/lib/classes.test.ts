import { describe, expect, it } from 'vitest'
import { classOf, classRange, quantileClasses } from './classes'
import { classColors } from './palette'

describe('quantileClasses', () => {
  it('spreads a skewed measure over every class', () => {
    // One giant among many small areas — a linear ramp would paint almost
    // everything the palest step.
    const values = [...Array.from({ length: 69 }, (_, i) => 100 + i), 700_000]
    const c = quantileClasses(values, 7)!
    expect(c.breaks).toHaveLength(6)
    const counts = new Array(7).fill(0)
    for (const v of values) counts[classOf(v, c.breaks)]++
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('collapses tied quantiles instead of leaving empty classes', () => {
    const c = quantileClasses([0, 0, 0, 0, 5, 10], 7)!
    expect(c.breaks).toEqual([5])
    expect(classRange(c, 0)).toEqual([0, 5])
    expect(classRange(c, 1)).toEqual([5, 10])
  })

  it('handles one value and no values', () => {
    expect(quantileClasses([42, 42], 7)).toEqual({ min: 42, max: 42, breaks: [] })
    expect(quantileClasses([], 7)).toBeNull()
  })
})

describe('classColors', () => {
  it('flips the ramp in the dark theme so more is further from the surface', () => {
    const light = classColors(7, 'light')
    expect(classColors(7, 'dark')).toEqual([...light].reverse())
    expect(classColors(3, 'light')).toHaveLength(3)
    expect(classColors(1, 'dark')).toEqual(classColors(1, 'light'))
  })
})
