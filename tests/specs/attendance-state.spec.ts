import { describe, expect, it } from 'vitest'
import { withdrawalReason, currentRegistration, canReregister, canOpenRegistrationPage } from '../../frontend/lib/attendance-state'

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
})
