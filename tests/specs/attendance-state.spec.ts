import { describe, expect, it } from 'vitest'
import { withdrawalReason, currentRegistration, canReregister, canOpenRegistrationPage, cancelledEventNotice } from '../../frontend/lib/attendance-state'

describe('attendee registration state', () => {
  it('explains disabled or expired withdrawal before submission', () => {
    const now = Date.parse('2026-10-29T12:00:00Z')
    expect(withdrawalReason({ withdrawalEnabled: false }, now)).toContain('not enabled')
    expect(withdrawalReason({ withdrawalEnabled: true, withdrawalCutoffAt: '2026-10-29T11:00:00Z' }, now)).toContain('deadline')
    expect(withdrawalReason({ withdrawalEnabled: true, withdrawalCutoffAt: '2026-10-29T12:00:00Z' }, now)).toBe('')
    expect(withdrawalReason(undefined, now)).toContain('unavailable')
  })
  it('prefers a current registration over historical withdrawn records', () => {
    const rows = [{ eventId: 'event', status: 'WITHDRAWN' }, { eventId: 'event', status: 'CONFIRMED' }]
    expect(currentRegistration(rows, 'event')?.status).toBe('CONFIRMED')
    expect(currentRegistration(rows.slice(0, 1), 'event')?.status).toBe('WITHDRAWN')
  })
  it('only permits re-registration after withdrawal when explicitly enabled', () => {
    expect(canReregister({ status: 'WITHDRAWN' }, true)).toBe(true)
    expect(canReregister({ status: 'WITHDRAWN' }, false)).toBe(false)
    expect(canReregister({ status: 'CONFIRMED' }, true)).toBe(false)
    expect(canReregister(null, false)).toBe(true)
  })
  it('offers the event page to coordinators and organisers at the right lifecycle stages', () => {
    for (const role of ['EVENT_ORGANISER', 'EVENT_COORDINATOR']) {
      expect(canOpenRegistrationPage({ role }, 'CONFIRMED')).toBe(true)
      expect(canOpenRegistrationPage({ role }, 'PREPARATION')).toBe(true)
      expect(canOpenRegistrationPage({ role }, 'ARRANGEMENT_PENDING')).toBe(false)
    }
    expect(canOpenRegistrationPage({ role: 'ATTENDEE' }, 'CONFIRMED')).toBe(false)
  })
  it('CS-48 AC3 reads the cancelled reason from the Nuxt-wrapped 409 body', () => {
    // Shape returned by /api/attendances/events/:id for a registrant of a cancelled Event
    // (captured in UAT on 5 Nov 2026). The top-level `error: true` must not hide data.error.
    const wrapped = {
      error: true,
      url: 'http://localhost:3000/api/attendances/events/398f31fe',
      statusCode: 409,
      statusMessage: 'This Event has been cancelled. Registration is closed.',
      message: 'This Event has been cancelled. Registration is closed.',
      data: { error: { code: 'EVENT_CANCELLED', message: 'This Event has been cancelled. Registration is closed.', title: 'UAT Tech Summit 2026' } },
    }
    expect(cancelledEventNotice(wrapped)).toEqual({ message: 'This Event has been cancelled. Registration is closed.', title: 'UAT Tech Summit 2026' })
    // The unwrapped service body still works, and a missing message falls back to the default text.
    expect(cancelledEventNotice({ error: { code: 'EVENT_CANCELLED', title: 'Gala' } })).toEqual({ message: 'This Event has been cancelled. Registration is closed.', title: 'Gala' })
  })
  it('CS-48 AC3 leaves every other error to the generic not-found card', () => {
    expect(cancelledEventNotice({ error: true, statusCode: 404, data: { error: { code: 'NOT_FOUND', message: 'Event not found.' } } })).toBeNull()
    expect(cancelledEventNotice({ error: true, statusCode: 503 })).toBeNull()
    expect(cancelledEventNotice({ error: 'EVENT_CANCELLED' })).toBeNull()
    expect(cancelledEventNotice(null)).toBeNull()
    expect(cancelledEventNotice(undefined)).toBeNull()
  })
})
