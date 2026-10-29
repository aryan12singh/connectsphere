import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { equipmentAllocations } = require('../../services/booking-service/src/equipmentAllocations') as {
  equipmentAllocations: (bookings: Array<Record<string, unknown>>, venues: Array<Record<string, unknown>>, now: string) => Array<Record<string, unknown>>
}
const { availabilityLine } = require('../../services/equipment-service/src/domain/equipment-availability') as {
  availabilityLine: (total: number, requested: number, commitments: Array<Record<string, unknown>>, startAt: string, endAt: string) => { requested: number, available: number, shortfall: number }
}

describe('CS-41 — current Booking allocation projection', () => {
  it('TC-CS41-13 excludes expired tentative holds from the current allocation projection', () => {
    const allocations = equipmentAllocations([
      { id: 'booking-a', venueId: 'venue-a', status: 'CONFIRMED', startAt: '2026-11-12T02:00:00.000Z', endAt: '2026-11-12T04:00:00.000Z', version: 4 },
      { id: 'booking-b', venueId: 'venue-b', status: 'TENTATIVELY_HELD', startAt: '2026-11-12T02:30:00.000Z', endAt: '2026-11-12T03:30:00.000Z', expiresAt: '2026-11-12T01:00:00.000Z', version: 2 },
    ], [
      { id: 'venue-a', setupMinutes: 30, turnaroundMinutes: 45, version: 7 },
      { id: 'venue-b', setupMinutes: 15, turnaroundMinutes: 30, version: 3 },
    ], '2026-11-12T01:30:00.000Z')

    expect(allocations.map(({ bookingId, venueId, bookingVersion, venueVersion }) => ({ bookingId, venueId, bookingVersion, venueVersion })))
      .toEqual([{ bookingId: 'booking-a', venueId: 'venue-a', bookingVersion: 4, venueVersion: 7 }])
  })
})

describe('CS-41 — availability calculations', () => {
  it('TC-CS41-04 reports non-negative period availability after reservations and operational unavailability', () => {
    const commitments = [
      { kind: 'RESERVATION', quantity: 2, startAt: '2026-11-12T01:00:00.000Z', endAt: '2026-11-12T03:00:00.000Z' },
      { kind: 'OPERATIONAL_UNAVAILABLE', quantity: 1, startAt: '2026-11-12T02:00:00.000Z', endAt: '2026-11-12T04:00:00.000Z' },
    ]
    expect(availabilityLine(5, 3, commitments, '2026-11-12T02:00:00.000Z', '2026-11-12T03:00:00.000Z'))
      .toEqual({ requested: 3, available: 2, shortfall: 1 })
    expect(availabilityLine(5, 3, commitments, '2026-11-12T04:00:00.000Z', '2026-11-12T05:00:00.000Z'))
      .toEqual({ requested: 3, available: 5, shortfall: 0 })
  })
})
