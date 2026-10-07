// PxWeb timestamps ("2026-10-06T13:57:00") carry no zone; they are Finnish
// local time. Comparing calendar days is all the UI needs, so they're read as
// local dates.

const DAY = 86_400_000

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "2026-05-29T08:00:00" -> "29.5.2026", the date format used across the app. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fi-FI')
}

/** "today", "yesterday", "3 days ago", else the short date. */
export function relativeDay(iso: string, now = new Date()): string {
  const days = Math.round((dayStart(now) - dayStart(new Date(iso))) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return shortDate(iso)
}
