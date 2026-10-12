/** Pure view helpers for the coordinator review queue (unit-testable, no setup). */

/** Relative submitted time, e.g. "2 hours ago", "yesterday", "3 days ago". */
export function timeAgo(iso: string | null): string {
  if (!iso)
    return 'date unknown'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs) || diffMs < 0)
    return 'just now'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1)
    return 'just now'
  if (minutes < 60)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1)
    return 'yesterday'
  return `${days} days ago`
}

function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match)
    return time
  const hours = Number(match[1])
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${match[2]} ${suffix}`
}

/** "Oct 14, 2026 · 9:00 AM - 5:00 PM" from record fields. */
export function formatDateTime(date: string, start: string, end: string): string {
  if (!date)
    return 'Date to be confirmed'
  const parsed = new Date(`${date}T00:00:00`)
  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
  if (!start)
    return day
  return `${day} · ${formatTime(start)}${end ? ` - ${formatTime(end)}` : ''}`
}

export const LAYOUT_LABELS: Record<string, string> = {
  theatre: 'Theatre style',
  classroom: 'Classroom style',
  banquet: 'Banquet',
  boardroom: 'Boardroom',
}
