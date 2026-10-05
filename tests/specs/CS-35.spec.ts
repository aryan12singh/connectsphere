import { describe, expect, it } from 'vitest'
import { bookingDraftForCalendarSlot, bookingDraftForSlot, bookingDraftState, bookingPopoverOffset, bookingSelectionStatuses, calendarSelectionFromDrag, calendarWallTimeToIso, canCreateBlock } from '../../frontend/app/components/venue/booking-state'

const existing = [{ id: 'block-1', venueId: 'venue-1', title: 'Maintenance', status: 'BLOCKED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T11:00:00Z' }]
const block = (overrides = {}) => ({ venueId: 'venue-1', title: 'Maintenance', reason: 'Electrical work', timeZone: 'Asia/Singapore', status: 'BLOCKED', startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T10:00:00Z', ...overrides })

describe('CS-35 — client-side booking and block behaviour', () => {
  it('TC-CS35-01 preserves a valid BLOCKED status and required reason', () => {
    expect(bookingDraftState(block(), [])).toMatchObject({ canSubmit: true, status: 'BLOCKED' })
    expect(bookingSelectionStatuses(false, true)).toEqual(['AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED'])
  })
  it('TC-CS35-02 prefills an empty-slot draft without performing a mutation', () => {
    expect(bookingDraftForSlot('venue-1', 'Asia/Singapore', '2026-12-22T09:00', '2026-12-22T10:00')).toMatchObject({ venueId: 'venue-1', timeZone: 'Asia/Singapore', status: 'TENTATIVELY_HELD', title: '' })
    expect(calendarSelectionFromDrag('2026-12-22T09:00:00Z', '2026-12-22T11:00:00Z')).toEqual({ startAt: '2026-12-22T09:00:00.000Z', endAt: '2026-12-22T11:00:00.000Z', durationMinutes: 120 })
    expect(bookingDraftForCalendarSlot('venue-1', 'Asia/Singapore', '2026-12-22', 9, 90)).toMatchObject({ startAt: '2026-12-22T09:00', endAt: '2026-12-22T10:30' })
    expect(calendarWallTimeToIso('2026-12-22T09:00', 'Asia/Singapore')).toBe('2026-12-22T01:00:00.000Z')
    expect(calendarWallTimeToIso(bookingDraftForCalendarSlot('venue-1', 'Asia/Singapore', '2026-12-22', 16, 60).startAt, 'Asia/Singapore')).toBe('2026-12-22T08:00:00.000Z')
    expect(bookingPopoverOffset(126)).toBe(134)
  })
  it('TC-CS35-03 hides block creation when the Coordinator lacks decision authority', () => { expect(canCreateBlock(false)).toBe(false) })
  it('TC-CS35-04 rejects an end time before the start time with field guidance', () => { expect(bookingDraftState(block({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T09:00:00Z' }), [])).toMatchObject({ canSubmit: false, errors: { endAt: 'End time must be after start time.' } }) })
  it('TC-CS35-05 warns about affected bookings but lets a BLOCKED interval continue', () => {
    expect(bookingDraftState(block({ startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T10:30:00Z' }), existing)).toMatchObject({ canSubmit: true, overlaps: ['block-1'] })
    expect(bookingDraftState(block({ id: 'block-1', startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T10:30:00Z' }), existing, 'block-1')).toMatchObject({ canSubmit: true, overlaps: [] })
  })
  it('TC-CS35-06 rejects a normal booking inside a blocking interval before it posts', () => { expect(bookingDraftState(block({ title: 'Product launch', reason: 'Customer event', status: 'CONFIRMED', startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T10:30:00Z' }), existing)).toMatchObject({ canSubmit: false, errors: { interval: 'This booking overlaps an unavailable interval.' } }) })
  it('TC-CS35-07 rejects equal times and accepts a one-minute block', () => {
    expect(bookingDraftState(block({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T10:00:00Z' }), [])).toMatchObject({ canSubmit: false, errors: { endAt: 'End time must be after start time.' } })
    expect(bookingDraftState(block({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T10:01:00Z' }), [])).toMatchObject({ canSubmit: true })
  })
})
