import { describe, expect, it } from 'vitest'
import { venueChangeLines } from '../../frontend/lib/venue-history'

describe('venue history change lines', () => {
  it('CS-33 AC4 shows the old and new capacity', () => {
    expect(venueChangeLines({ before: { capacity: 40, name: 'UAT Studio' }, after: { capacity: 50, name: 'UAT Studio' } })).toEqual(['Capacity: 40 → 50'])
  })
  it('CS-84 AC5 shows the old and new setup and turnaround buffers', () => {
    expect(venueChangeLines({ before: { setupMinutes: 0, turnaroundMinutes: 0 }, after: { setupMinutes: 30, turnaroundMinutes: 45 } }))
      .toEqual(['Setup: 0 min → 30 min', 'Turnaround: 0 min → 45 min'])
  })
  it('lists nothing for entries without a before/after pair', () => {
    expect(venueChangeLines({ created: { capacity: 40 } } as never)).toEqual([])
    expect(venueChangeLines(null)).toEqual([])
  })
})
