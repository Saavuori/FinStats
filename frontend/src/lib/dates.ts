// PxWeb timestamps ("2026-10-06T13:57:00") carry no zone; they are Finnish
// local time. Comparing calendar days is all the UI needs, so they're read as
// local dates.

const DAY = 86_400_000

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "6 Oct 2026" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "today", "yesterday", "3 days ago", else the short date. */
export function relativeDay(iso: string, now = new Date()): string {
  const days = Math.round((dayStart(now) - dayStart(new Date(iso))) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return shortDate(iso)
}
