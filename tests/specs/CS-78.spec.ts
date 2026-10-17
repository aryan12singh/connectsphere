// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const availability = require('../../services/booking-service/src/availability.js')

describe('CS-78 — explicit hold clock (domain unit checks)', () => {
  it('TC-CS78-01 expires exactly at the persisted deadline even without a worker', () => {
    const deadline = '2030-01-01T10:00:00Z'
    expect(availability.holdIsExpired?.(deadline, '2030-01-01T09:59:59.999Z')).toBe(false)
    expect(availability.holdIsExpired?.(deadline, deadline)).toBe(true)
    expect(availability.holdIsExpired?.(deadline, '2030-01-01T10:00:00.001Z')).toBe(true)
  })

  it('TC-CS78-02 treats equivalent timezone offsets as the same instant and uses the supplied clock', () => {
    expect(availability.holdIsExpired('2030-01-01T18:00:00+08:00', '2030-01-01T10:00:00Z')).toBe(true)
    expect(availability.holdIsExpired('2030-01-01T18:00:00+08:00', '2030-01-01T09:59:59Z')).toBe(false)
  })

  it.each(['bad', '2030-01-01', '2030-01-01T10:00:00', '2030-02-30T10:00:00Z', '2030-01-01T10:00:00.0001Z', null, undefined])('TC-CS78-03 fails closed on invalid clock data (%s)', (value) => {
    expect(() => availability.holdIsExpired(value, '2030-01-01T10:00:00Z')).toThrow(/deadline/)
    expect(() => availability.holdIsExpired('2030-01-01T10:00:00Z', value)).toThrow(/at/)
  })

  it('TC-CS78-04 warns only within the explicitly supplied active warning window', () => {
    const deadline = '2030-01-01T10:00:00Z'
    expect(availability.holdWarningDue?.(deadline, '2030-01-01T09:00:00Z', 3_600_000)).toBe(true)
    expect(availability.holdWarningDue?.(deadline, '2030-01-01T08:59:59.999Z', 3_600_000)).toBe(false)
    expect(availability.holdWarningDue?.(deadline, '2030-01-01T10:00:00Z', 3_600_000)).toBe(false)
    expect(availability.holdWarningDue?.(deadline, '2030-01-01T10:00:00.001Z', 3_600_000)).toBe(false)
    expect(availability.holdWarningDue?.(deadline, '2030-01-01T09:59:59.999Z', 0)).toBe(false)
  })

  it.each([-1, 0.5, '3600', undefined, Infinity, Number.MAX_SAFE_INTEGER + 1])('TC-CS78-04 requires a non-negative explicit warning lead (%s)', (value) => {
    expect(() => availability.holdWarningDue('2030-01-01T10:00:00Z', '2030-01-01T09:00:00Z', value)).toThrow(/warningLeadMs/)
  })

  it('TC-CS78-05 applies the selected inclusive or strict setup boundary without guessing policy', () => {
    const hold = Object.freeze({ createdAt: '2030-01-01T08:00:00Z', expiresAt: '2030-01-01T10:00:00Z', occupiedStartAt: '2030-01-01T10:00:00Z' })
    expect(availability.validateHoldDeadline?.(hold, { allowExpiryAtOccupiedStart: true })).toEqual({})
    expect(() => availability.validateHoldDeadline(hold, { allowExpiryAtOccupiedStart: false })).toThrow(/expiresAt/)
    expect(() => availability.validateHoldDeadline(hold, {})).toThrow(/allowExpiryAtOccupiedStart/)
    expect(() => availability.validateHoldDeadline({ ...hold, expiresAt: hold.createdAt }, { allowExpiryAtOccupiedStart: true })).toThrow(/expiresAt/)
    expect(() => availability.validateHoldDeadline({ ...hold, expiresAt: '2030-01-01T10:00:00.001Z' }, { allowExpiryAtOccupiedStart: true })).toThrow(/expiresAt/)
    expect(hold.expiresAt).toBe('2030-01-01T10:00:00Z')
  })
})
