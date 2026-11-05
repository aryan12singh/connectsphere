// CS-33 AC4 / CS-84 AC5: venue history lists what changed, old → new.
// Each history entry already stores `changes.before` and `changes.after`;
// this turns the fields a reviewer cares about into short readable lines.

const FIELDS: Array<[key: string, label: string, unit?: string]> = [
  ['name', 'Name'],
  ['address', 'Address'],
  ['capacity', 'Capacity'],
  ['venueType', 'Venue type'],
  ['setupMinutes', 'Setup', ' min'],
  ['turnaroundMinutes', 'Turnaround', ' min'],
  ['timeZone', 'Time zone'],
  ['isActive', 'Active'],
  ['supportedLayouts', 'Layouts'],
  ['facilities', 'Facilities'],
  ['accessibilityTags', 'Accessibility'],
]

type Changes = { before?: Record<string, unknown> | null, after?: Record<string, unknown> | null } | null | undefined

function show(value: unknown, unit = '') {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return `${value}${unit}`
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

/** e.g. ["Capacity: 40 → 50", "Setup: 0 min → 30 min"] */
export function venueChangeLines(changes: Changes): string[] {
  const before = changes?.before
  const after = changes?.after
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return []
  const lines: string[] = []
  for (const [key, label, unit] of FIELDS) {
    if (!(key in before) && !(key in after)) continue
    if (same(before[key], after[key])) continue
    lines.push(`${label}: ${show(before[key], unit)} → ${show(after[key], unit)}`)
  }
  return lines
}
