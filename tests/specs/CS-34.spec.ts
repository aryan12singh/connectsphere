import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { bookingDraftForExisting, bookingMutation, calendarIsoToWallTime, canCreateBlock, coordinatorBookingEditState } from '../../frontend/app/components/venue/booking-state'
import { calendarRange, calendarSlotState, fullDayCalendarHours, intervalSegmentsForRange } from '../../frontend/app/components/venue/calendar-state'

const require = createRequire(import.meta.url)
const { availabilityRange } = require('../../services/booking-service/src/availability') as { availabilityRange: (query: Record<string, string>) => Record<string, string[]> }
const week = calendarRange('week', new Date('2026-12-21T00:00:00Z'))

describe('CS-34 — venue availability calendar', () => {
  it('TC-CS34-01 renders an ordinary booking and BLOCKED interval separately', () => {
    const segments = intervalSegmentsForRange([{ id: 'booking', title: 'Launch', status: 'CONFIRMED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T10:00:00Z' }, { id: 'block', title: 'Maintenance', status: 'BLOCKED', startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T11:00:00Z' }], week)
    expect(segments.map(segment => `${segment.booking.id}:${segment.kind}`)).toEqual(['booking:booking', 'block:block'])
    expect(fullDayCalendarHours()).toEqual(Array.from({ length: 24 }, (_, hour) => hour))
    const hours = [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '17:00' }]
    expect(calendarSlotState('2026-12-21', 8, hours)).toBe('unavailable')
    expect(calendarSlotState('2026-12-21', 9, hours)).toBe('available')
    expect(calendarSlotState('2026-12-21', 17, hours)).toBe('unavailable')
    expect(calendarSlotState('2026-12-22', 10, hours)).toBe('unavailable')
  })
  it('TC-CS34-02 renders a refreshed persisted block only once', () => {
    const block = { id: 'block', title: 'Maintenance', status: 'BLOCKED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T10:00:00Z' }
    expect(intervalSegmentsForRange([block, block], week).filter(segment => segment.booking.id === 'block')).toHaveLength(1)
  })
  it('TC-CS34-03 advances the week and preserves the selected day in Day mode', () => {
    expect(calendarRange('week', new Date('2026-12-23T12:00:00Z'))).toMatchObject({ startAt: '2026-12-21T00:00:00.000Z', endAt: '2026-12-28T00:00:00.000Z' })
    expect(calendarRange('day', new Date('2026-12-23T12:00:00Z'))).toMatchObject({ startAt: '2026-12-23T00:00:00.000Z', endAt: '2026-12-24T00:00:00.000Z' })
  })
  it('TC-CS34-04 hides venue-staff-only block controls for a Coordinator', () => { expect(canCreateBlock(false)).toBe(false) })
  it('TC-CS34-05 returns standard field guidance when the range ends before it starts', () => {
    expect(availabilityRange({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T09:00:00Z' })).toEqual({ endAt: ['End time must be after start time'] })
  })
  it('TC-CS34-06 keeps adjacent intervals distinct and splits a midnight booking across dates', () => {
    const segments = intervalSegmentsForRange([{ id: 'a', title: 'Booking', status: 'CONFIRMED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T10:00:00Z' }, { id: 'b', title: 'Block', status: 'BLOCKED', startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T11:00:00Z' }, { id: 'overnight', title: 'Overnight', status: 'CONFIRMED', startAt: '2026-12-22T23:30:00Z', endAt: '2026-12-23T01:00:00Z' }], week)
    expect(segments.filter(segment => segment.booking.id === 'overnight')).toHaveLength(2)
    expect(segments.filter(segment => segment.booking.id === 'a' || segment.booking.id === 'b')).toHaveLength(2)
    const existing = { id: 'booking-1', venueId: 'venue-1', title: 'Existing booking', reason: 'Client meeting', status: 'CONFIRMED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T10:00:00Z', timeZone: 'Asia/Singapore' }
    expect(bookingDraftForExisting(existing)).toMatchObject({ venueId: existing.venueId, title: existing.title, reason: existing.reason, status: existing.status, timeZone: existing.timeZone, startAt: '2026-12-22T17:00', endAt: '2026-12-22T18:00' })
    expect(calendarIsoToWallTime('2026-12-22T12:00:00.000Z', 'Asia/Singapore')).toBe('2026-12-22T20:00')
    expect(bookingDraftForExisting({ ...existing, startAt: '2026-12-22T12:00:00.000Z', endAt: '2026-12-22T13:00:00.000Z' })).toMatchObject({ startAt: '2026-12-22T20:00', endAt: '2026-12-22T21:00' })
    expect(bookingMutation(existing.id)).toEqual({ method: 'PUT', path: '/api/bookings/booking-1' })
    expect(coordinatorBookingEditState({ ...existing, status: 'TENTATIVELY_HELD', requestedById: 'coordinator-1' }, 'coordinator-1')).toMatchObject({ canEdit: true, readOnly: false, statuses: ['TENTATIVELY_HELD', 'CANCELLED'] })
    expect(coordinatorBookingEditState({ ...existing, status: 'CANCELLED', requestedById: 'coordinator-1' }, 'coordinator-1')).toMatchObject({ canEdit: true, readOnly: false, statuses: ['TENTATIVELY_HELD', 'CANCELLED'] })
    expect(coordinatorBookingEditState({ ...existing, requestedById: 'coordinator-2' }, 'coordinator-1')).toMatchObject({ canEdit: false, readOnly: true, statuses: ['CONFIRMED'] })
    expect(coordinatorBookingEditState(null, 'coordinator-1')).toMatchObject({ canEdit: false, readOnly: false, statuses: ['TENTATIVELY_HELD'] })
  })
})
