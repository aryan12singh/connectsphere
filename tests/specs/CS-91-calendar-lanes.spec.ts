import { describe, expect, it } from 'vitest'
import { intervalSegmentsForRange, segmentKey, segmentLanes, type CalendarBooking } from '../../frontend/app/components/venue/calendar-state'

const range = { startAt: '2026-12-06T16:00:00.000Z', endAt: '2026-12-13T16:00:00.000Z' }
const booking = (id: string, status: string, startAt: string, endAt: string, flags: string[] = []) =>
  ({ id, status, startAt, endAt, flags, title: id } as unknown as CalendarBooking)

describe('CS-91 AC3 calendar blocks that overlap share the day column', () => {
  it('shows an Affected booking beside the Unavailable window that covers it', () => {
    // Alan's case: Event B held 10:00-16:00 SGT, then the venue is marked unavailable 09:00-17:00.
    const affected = booking('event-b', 'TENTATIVELY_HELD', '2026-12-10T02:00:00.000Z', '2026-12-10T08:00:00.000Z', ['AFFECTED_UNAVAILABLE'])
    const unavailable = booking('aircon', 'UNAVAILABLE', '2026-12-10T01:00:00.000Z', '2026-12-10T09:00:00.000Z')
    const segments = intervalSegmentsForRange([unavailable, affected], range, 'Asia/Singapore')
    const lanes = segmentLanes(segments)
    const forId = (id: string) => lanes.get(segmentKey(segments.find(segment => segment.booking.id === id)!))
    expect(forId('aircon')).toEqual({ lane: 0, lanes: 2 })
    expect(forId('event-b')).toEqual({ lane: 1, lanes: 2 })
  })

  it('keeps separate and back-to-back blocks full width', () => {
    const morning = booking('morning', 'CONFIRMED', '2026-12-10T02:00:00.000Z', '2026-12-10T05:00:00.000Z')
    const afternoon = booking('afternoon', 'CONFIRMED', '2026-12-10T05:00:00.000Z', '2026-12-10T08:00:00.000Z')
    const otherDay = booking('other-day', 'CONFIRMED', '2026-12-11T02:00:00.000Z', '2026-12-11T08:00:00.000Z')
    const lanes = segmentLanes(intervalSegmentsForRange([morning, afternoon, otherDay], range, 'Asia/Singapore'))
    expect([...lanes.values()]).toEqual([{ lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }])
  })

  it('reuses a lane once it is free and sizes the whole overlap group together', () => {
    // A 09-17 spans B 10-12 and C 13-15: B and C can share lane 1, so the group needs two lanes.
    const a = booking('a', 'UNAVAILABLE', '2026-12-10T01:00:00.000Z', '2026-12-10T09:00:00.000Z')
    const b = booking('b', 'CONFIRMED', '2026-12-10T02:00:00.000Z', '2026-12-10T04:00:00.000Z')
    const c = booking('c', 'CONFIRMED', '2026-12-10T05:00:00.000Z', '2026-12-10T07:00:00.000Z')
    const d = booking('d', 'BLOCKED', '2026-12-10T05:30:00.000Z', '2026-12-10T06:00:00.000Z')
    const segments = intervalSegmentsForRange([a, b, c, d], range, 'Asia/Singapore')
    const lanes = segmentLanes(segments)
    const forId = (id: string) => lanes.get(segmentKey(segments.find(segment => segment.booking.id === id)!))
    expect(forId('a')).toEqual({ lane: 0, lanes: 3 })
    expect(forId('b')).toEqual({ lane: 1, lanes: 3 })
    expect(forId('c')).toEqual({ lane: 1, lanes: 3 })
    expect(forId('d')).toEqual({ lane: 2, lanes: 3 })
  })
})
