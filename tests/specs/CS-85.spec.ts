// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const availability = require('../../services/booking-service/src/availability.js')

describe('CS-85 — occupied-window calculation (domain unit tests)', () => {
  it('TC-CS85-01 expands the advertised interval by the venue setup and turnaround', () => {
    expect(availability.occupiedWindow?.({
      startAt: '2026-12-22T10:00:00+08:00',
      endAt: '2026-12-22T12:00:00+08:00',
    }, { setupMinutes: 30, turnaroundMinutes: 45 })).toEqual({
      startAt: '2026-12-22T01:30:00.000Z',
      endAt: '2026-12-22T04:45:00.000Z',
    })
  })

  it('TC-CS85-01 preserves the advertised instants when both buffers are zero', () => {
    expect(availability.occupiedWindow({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' },
      { setupMinutes: 0, turnaroundMinutes: 0 })).toEqual({ startAt: '2026-12-22T10:00:00.000Z', endAt: '2026-12-22T12:00:00.000Z' })
  })

  it('TC-CS85-01 expands across midnight and year boundaries without changing the booking', () => {
    const booking = Object.freeze({ startAt: '2027-01-01T00:15:00Z', endAt: '2027-01-01T23:45:00Z' })
    const buffers = Object.freeze({ setupMinutes: 30, turnaroundMinutes: 30 })
    expect(availability.occupiedWindow(booking, buffers)).toEqual({ startAt: '2026-12-31T23:45:00.000Z', endAt: '2027-01-02T00:15:00.000Z' })
    expect(booking).toEqual({ startAt: '2027-01-01T00:15:00Z', endAt: '2027-01-01T23:45:00Z' })
  })

  it('TC-CS85-01 uses instants rather than comparing repeated local clock values', () => {
    expect(availability.occupiedWindow({ startAt: '2026-11-01T01:30:00-04:00', endAt: '2026-11-01T01:30:00-05:00' },
      { setupMinutes: 30, turnaroundMinutes: 15 })).toEqual({ startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T06:45:00.000Z' })
  })

  it('TC-CS85-01 applies each selected venue\'s own buffers', () => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: 30 })).toEqual({ startAt: '2026-12-22T10:00:00.000Z', endAt: '2026-12-22T12:30:00.000Z' })
    expect(availability.occupiedWindow(booking, { setupMinutes: 60, turnaroundMinutes: 0 })).toEqual({ startAt: '2026-12-22T09:00:00.000Z', endAt: '2026-12-22T12:00:00.000Z' })
  })

  it.each([-1, 0.5, '30', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('TC-CS85-11 rejects invalid buffer minutes (%s) without coercion', (value) => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindow(booking, { setupMinutes: value, turnaroundMinutes: 0 })).toThrow(/setupMinutes/)
    expect(() => availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: value })).toThrow(/turnaroundMinutes/)
  })

  it.each(['not-a-date', '2026-12-22', '2026-12-22T10:00:00', '2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-12-22T24:00:00Z', '2026-12-22T10:00:00.0001Z', null, undefined])('TC-CS85-12 rejects invalid or ambiguous instants (%s)', (value) => {
    const buffers = { setupMinutes: 0, turnaroundMinutes: 0 }
    expect(() => availability.occupiedWindow({ startAt: value, endAt: '2026-12-23T12:00:00Z' }, buffers)).toThrow(/startAt/)
    expect(() => availability.occupiedWindow({ startAt: '2026-01-01T10:00:00Z', endAt: value }, buffers)).toThrow(/endAt/)
  })

  it('TC-CS85-12 rejects equal or reversed booking instants', () => {
    const buffers = { setupMinutes: 30, turnaroundMinutes: 45 }
    for (const endAt of ['2026-12-22T10:00:00Z', '2026-12-22T09:00:00Z']) {
      expect(() => availability.occupiedWindow({ startAt: '2026-12-22T10:00:00Z', endAt }, buffers)).toThrow(/endAt/)
    }
  })

  it('TC-CS85-13 fails closed when expansion cannot be represented as date-time instants', () => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindow(booking, { setupMinutes: Number.MAX_SAFE_INTEGER, turnaroundMinutes: 0 })).toThrow(/occupied window/)
    expect(() => availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: Number.MAX_SAFE_INTEGER })).toThrow(/occupied window/)
  })

  it.each([
    ['2026-12-22T12:44:00Z', true],
    ['2026-12-22T12:44:59Z', true],
    ['2026-12-22T12:45:00Z', false],
    ['2026-12-22T12:46:00Z', false],
  ])('TC-CS85-07 compares occupied windows at %s with touching explicitly permitted', (startAt, expected) => {
    const first = { startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' }
    const second = { startAt, endAt: '2026-12-22T14:00:00Z' }
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: true })).toBe(expected)
    expect(availability.occupiedWindowsOverlap?.(second, first, { allowTouching: true })).toBe(expected)
  })

  it('TC-CS85-07 applies a forbidden-touching policy without changing either window', () => {
    const first = Object.freeze({ startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' })
    const second = Object.freeze({ startAt: '2026-12-22T20:45:00+08:00', endAt: '2026-12-22T22:00:00+08:00' })
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: false })).toBe(true)
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: true })).toBe(false)
    expect(first.endAt).toBe('2026-12-22T12:45:00Z')
    expect(second.startAt).toBe('2026-12-22T20:45:00+08:00')
  })

  it('TC-CS85-07 detects containment and identical windows but permits a real gap', () => {
    const outer = { startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' }
    const inner = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T11:00:00Z' }
    const later = { startAt: '2026-12-22T13:00:00Z', endAt: '2026-12-22T14:00:00Z' }
    for (const allowTouching of [true, false]) {
      expect(availability.occupiedWindowsOverlap?.(outer, inner, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(inner, outer, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(outer, outer, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(outer, later, { allowTouching })).toBe(false)
    }
  })

  it.each([undefined, {}, { allowTouching: 'true' }, { allowTouching: 1 }])('TC-CS85-07 refuses to invent a touching policy (%s)', (options) => {
    const window = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindowsOverlap(window, window, options)).toThrow(/allowTouching/)
  })

  it('TC-CS85-12 rejects invalid comparison windows before reporting availability', () => {
    const valid = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    const reversed = { startAt: '2026-12-22T13:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindowsOverlap(reversed, valid, { allowTouching: true })).toThrow(/endAt/)
    expect(() => availability.occupiedWindowsOverlap(valid, reversed, { allowTouching: true })).toThrow(/endAt/)
  })
})
