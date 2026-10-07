// CSV export of a cube in tidy "long" form: one row per observation, one
// column per dimension, then the value — the shape a spreadsheet pivot, R or
// pandas takes as-is. Codes get a column of their own wherever they differ
// from the labels (area and measure codes are the keys other data joins on).

import { unitOf, type Cube } from './jsonstat'

function field(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function cubeToCsv(cube: Cube): string {
  const labels = cube.dims.map((d) => new Map(d.categories.map((c) => [c.code, c.label])))
  const withCode = cube.dims.map((d) => d.categories.some((c) => c.code !== c.label))
  const hasUnit = cube.metricDim != null && Object.keys(cube.units).length > 0

  const header: string[] = []
  cube.dims.forEach((d, i) => {
    if (withCode[i]) header.push(`${d.label} (code)`)
    header.push(d.label)
  })
  if (hasUnit) header.push('Unit')
  header.push('Value')

  const lines = [header.map(field).join(',')]
  for (const rec of cube.records) {
    const row: string[] = []
    cube.dims.forEach((d, i) => {
      const code = rec.key[d.id]
      if (withCode[i]) row.push(code)
      row.push(labels[i].get(code) ?? code)
    })
    if (hasUnit) row.push(unitOf(cube, rec.key[cube.metricDim!]).label)
    row.push(rec.value == null ? '' : String(rec.value))
    lines.push(row.map(field).join(','))
  }
  // The byte-order mark makes Excel read the file as UTF-8 (ä, ö, å).
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Hand the browser a file to save. */
export function download(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
