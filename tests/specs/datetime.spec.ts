import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '../../frontend/lib/datetime'

// Server rendering (UTC, en-US) and the browser (any locale and zone) must
// produce the same text, or Vue reports a hydration mismatch.
describe('shared date display', () => {
  it('formats in Singapore time with a fixed locale whatever the runtime zone', () => {
    expect(formatDateTime('2026-10-20T03:15:00.000Z')).toBe('20 Oct 2026, 11:15 am')
    expect(formatDate('2026-10-20T17:00:00.000Z')).toBe('21 Oct 2026')
  })

  it('uses the Event zone when one is given', () => {
    expect(formatDateTime('2026-10-20T03:15:00.000Z', 'UTC')).toBe('20 Oct 2026, 3:15 am')
    expect(formatDateTime('2026-10-20T03:15:00.000Z', null)).toBe('20 Oct 2026, 11:15 am')
  })

  it('returns an empty string for missing or invalid values', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDate('not a date')).toBe('')
  })
})
