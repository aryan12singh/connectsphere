import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { equipmentPeriod } = require('../../services/equipment-service/src/domain/equipment-period') as {
  equipmentPeriod: (bookings: Array<Record<string, string>>) => { startAt: string, endAt: string }
}
const { equipmentAllocations } = require('../../services/booking-service/src/equipmentAllocations') as {
  equipmentAllocations: (bookings: Array<Record<string, unknown>>, venues: Array<Record<string, unknown>>, now: string) => Array<Record<string, unknown>>
}
const { availabilityLine } = require('../../services/equipment-service/src/domain/equipment-availability') as {
  availabilityLine: (total: number, requested: number, commitments: Array<Record<string, unknown>>, startAt: string, endAt: string) => { requested: number, available: number, shortfall: number }
}

describe('CS-41 — venue-buffered equipment period', () => {
  it('TC-CS41-12 pools each selected venue booking using its server-computed occupied window', () => {
    expect(equipmentPeriod([
      { bookingId: 'booking-a', occupiedStartAt: '2026-11-12T01:30:00.000Z', occupiedEndAt: '2026-11-12T04:45:00.000Z' },
      { bookingId: 'booking-b', occupiedStartAt: '2026-11-12T02:15:00.000Z', occupiedEndAt: '2026-11-12T04:00:00.000Z' },
    ])).toEqual({ startAt: '2026-11-12T01:30:00.000Z', endAt: '2026-11-12T04:45:00.000Z' })
  })

  it('TC-CS41-13 derives each allocation from its venue buffers and excludes expired holds', () => {
    const allocations = equipmentAllocations([
      { id: 'booking-a', venueId: 'venue-a', status: 'CONFIRMED', startAt: '2026-11-12T02:00:00.000Z', endAt: '2026-11-12T04:00:00.000Z', version: 4 },
      { id: 'booking-b', venueId: 'venue-b', status: 'TENTATIVELY_HELD', startAt: '2026-11-12T02:30:00.000Z', endAt: '2026-11-12T03:30:00.000Z', expiresAt: '2026-11-12T01:00:00.000Z', version: 2 },
    ], [
      { id: 'venue-a', setupMinutes: 30, turnaroundMinutes: 45, version: 7 },
      { id: 'venue-b', setupMinutes: 15, turnaroundMinutes: 30, version: 3 },
    ], '2026-11-12T01:30:00.000Z')

    expect(allocations).toEqual([expect.objectContaining({
      bookingId: 'booking-a', venueId: 'venue-a', bookingVersion: 4, venueVersion: 7,
      occupiedStartAt: '2026-11-12T01:30:00.000Z', occupiedEndAt: '2026-11-12T04:45:00.000Z',
    })])
  })

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
