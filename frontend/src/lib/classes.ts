// Quantile classes for the choropleth. Each class holds about the same number
// of areas, so a skewed measure still spreads over the whole ramp: on a linear
// scale Helsinki's 700 000 residents would paint nearly every other
// municipality (median about 6 000) the palest step.

export interface Classes {
  min: number
  max: number
  /** Ascending lower bounds of every class after the first. */
  breaks: number[]
}

/** Up to `maxClasses` quantile classes over `values`; null when there are none. */
export function quantileClasses(values: number[], maxClasses: number): Classes | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const k = Math.min(maxClasses, new Set(sorted).size)
  const breaks: number[] = []
  for (let i = 1; i < k; i++) {
    const b = sorted[Math.floor((i * sorted.length) / k)]
    // Ties can make two quantiles equal; an empty class is no class.
    if (b > (breaks.at(-1) ?? sorted[0])) breaks.push(b)
  }
  return { min: sorted[0], max: sorted[sorted.length - 1], breaks }
}

/** Which class `value` falls in: the number of breaks it reaches. */
export function classOf(value: number, breaks: number[]): number {
  let i = 0
  while (i < breaks.length && value >= breaks[i]) i++
  return i
}

/** [lower, upper] of class `i`. */
export function classRange(c: Classes, i: number): [number, number] {
  return [i === 0 ? c.min : c.breaks[i - 1], i === c.breaks.length ? c.max : c.breaks[i]]
}
