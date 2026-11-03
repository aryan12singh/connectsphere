// Date display shared by server rendering and the browser. A fixed locale and
// time zone keep both sides identical: the default locale/zone differs between
// the Node server (UTC, en-US) and the user's browser, which caused hydration
// mismatches and inconsistent formats.
export const DISPLAY_TIME_ZONE = 'Asia/Singapore'

function valid(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "20 Oct 2026, 11:15 am" in the given zone (Singapore by default). */
export function formatDateTime(value: string | number | Date | null | undefined, timeZone: string | null = DISPLAY_TIME_ZONE) {
  const date = valid(value)
  return date ? new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || DISPLAY_TIME_ZONE }).format(date) : ''
}

/** "20 Oct 2026" in the given zone (Singapore by default). */
export function formatDate(value: string | number | Date | null | undefined, timeZone: string | null = DISPLAY_TIME_ZONE) {
  const date = valid(value)
  return date ? new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeZone: timeZone || DISPLAY_TIME_ZONE }).format(date) : ''
}
