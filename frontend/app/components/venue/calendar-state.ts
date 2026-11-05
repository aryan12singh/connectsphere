import { calendarIsoToWallTime, calendarWallTimeToIso } from './booking-state'

export type CalendarMode = 'week' | 'day'

export interface CalendarRange {
  startAt: string
  endAt: string
}

export interface CalendarBooking {
  id: string
  venueId?: string
  title: string
  status: string
  startAt: string
  endAt: string
  reason?: string
  timeZone?: string
  requestedById?: string
  eventId?: string | null
  version?: number
  currentCoordinatorId?: string
  setupMinutes?: number
  turnaroundMinutes?: number
  occupiedStart?: string
  occupiedEnd?: string
  expiresAt?: string | null
  flags?: string[]
}

/** Server-computed buffer intervals use the same clipping and timezone path. */
export function bufferSegmentsForRange(bookings: CalendarBooking[],range:CalendarRange,timeZone='UTC') {
  return bookings.flatMap(booking=>{
    const windows=[{kind:'setup' as const,startAt:booking.occupiedStart,endAt:booking.startAt},{kind:'turnaround' as const,startAt:booking.endAt,endAt:booking.occupiedEnd}]
    return windows.flatMap(window=>window.startAt && window.endAt && Date.parse(window.endAt)>Date.parse(window.startAt)
      ? intervalSegmentsForRange([{...booking,startAt:window.startAt,endAt:window.endAt}],range,timeZone).map(segment=>({...segment,kind:window.kind,booking})) : [])
  })
}

export interface CalendarOperatingHour {
  weekday: string
  isClosed: boolean
  opensAt: string
  closesAt: string
}

export interface IntervalSegment {
  booking: CalendarBooking
  day: string
  startAt: string
  endAt: string
  kind: 'booking' | 'block'
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function fullDayCalendarHours() {
  return Array.from({ length: 24 }, (_, hour) => hour)
}

function minutes(value: string) {
  const [hours = Number.NaN, mins = Number.NaN] = value.split(':').map(Number)
  return Number.isInteger(hours) && Number.isInteger(mins) ? hours * 60 + mins : Number.NaN
}

export function calendarSlotState(day: string, hour: number, operatingHours: CalendarOperatingHour[]): 'available' | 'unavailable' {
  if (operatingHours.length === 0) return 'available'
  const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${day}T00:00:00Z`).getUTCDay()]
  const operatingHour = operatingHours.find(value => value.weekday === weekday)
  if (!operatingHour || operatingHour.isClosed) return 'unavailable'
  const opensAt = minutes(operatingHour.opensAt)
  const closesAt = minutes(operatingHour.closesAt)
  const slotStart = hour * 60
  const slotEnd = slotStart + 60
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) && slotStart >= opensAt && slotEnd <= closesAt ? 'available' : 'unavailable'
}

// activeDate is a civil-date coordinate (UTC year/month/day), not an instant.
// Convert its boundaries separately; a venue day may contain 23 or 25 hours.
export function calendarRange(mode: CalendarMode, activeDate: Date, timeZone = 'UTC'): CalendarRange {
  const day = startOfDay(activeDate)
  const weekday = (day.getUTCDay() + 6) % 7
  const start = mode === 'week' ? addDays(day, -weekday) : day
  const end = addDays(start, mode === 'week' ? 7 : 1)
  return {
    startAt: calendarWallTimeToIso(`${start.toISOString().slice(0, 10)}T00:00`, timeZone),
    endAt: calendarWallTimeToIso(`${end.toISOString().slice(0, 10)}T00:00`, timeZone),
  }
}

export function calendarDaysForRange(range: CalendarRange, timeZone: string): Date[] {
  const start = new Date(`${calendarIsoToWallTime(range.startAt, timeZone).slice(0, 10)}T00:00:00Z`)
  const endDay = calendarIsoToWallTime(range.endAt, timeZone).slice(0, 10)
  const days: Date[] = []
  for (let day = start; day.toISOString().slice(0, 10) < endDay; day = addDays(day, 1)) days.push(day)
  return days
}

export function advanceCalendarDate(mode: CalendarMode, activeDate: Date, direction: -1 | 1) {
  return addDays(startOfDay(activeDate), direction * (mode === 'week' ? 7 : 1))
}

export function intervalSegmentsForRange(bookings: CalendarBooking[], range: CalendarRange, timeZone = 'UTC'): IntervalSegment[] {
  const rangeStart = new Date(range.startAt)
  const rangeEnd = new Date(range.endAt)
  const uniqueBookings = bookings.filter((booking, index) => bookings.findIndex(candidate => candidate.id === booking.id) === index)
  return uniqueBookings.flatMap((booking) => {
    const start = new Date(booking.startAt)
    const end = new Date(booking.endAt)
    if (!(end > rangeStart && start < rangeEnd)) return []
    const firstDate = calendarIsoToWallTime(new Date(Math.max(start.getTime(), rangeStart.getTime())).toISOString(), timeZone).slice(0, 10)
    const firstDay = new Date(`${firstDate}T00:00:00Z`)
    const lastInstant = new Date(Math.min(end.getTime(), rangeEnd.getTime()) - 1)
    const lastDay = new Date(`${calendarIsoToWallTime(lastInstant.toISOString(), timeZone).slice(0, 10)}T00:00:00Z`)
    const segments: IntervalSegment[] = []
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      const nextDay = addDays(day, 1)
      const dayStart = Date.parse(calendarWallTimeToIso(`${day.toISOString().slice(0, 10)}T00:00`, timeZone))
      const dayEnd = Date.parse(calendarWallTimeToIso(`${nextDay.toISOString().slice(0, 10)}T00:00`, timeZone))
      segments.push({
        booking,
        day: day.toISOString().slice(0, 10),
        startAt: new Date(Math.max(start.getTime(), dayStart, rangeStart.getTime())).toISOString(),
        endAt: new Date(Math.min(end.getTime(), dayEnd, rangeEnd.getTime())).toISOString(),
        kind: booking.status === 'BLOCKED' ? 'block' : 'booking',
      })
    }
    return segments
  })
}

export type SegmentLane = { lane: number, lanes: number }

export function segmentKey(segment: Pick<IntervalSegment, 'booking' | 'day'>): string {
  return `${segment.booking.id}-${segment.day}`
}

// CS-91 AC3: blocks on the same day that overlap in time share the column side
// by side, so an Unavailable window cannot hide the "Affected — alternative
// required" booking underneath it. Blocks that only touch (end == start) do not overlap.
export function segmentLanes(segments: IntervalSegment[]): Map<string, SegmentLane> {
  const result = new Map<string, SegmentLane>()
  const byDay = new Map<string, IntervalSegment[]>()
  for (const segment of segments) byDay.set(segment.day, [...(byDay.get(segment.day) ?? []), segment])
  for (const daySegments of byDay.values()) {
    const sorted = [...daySegments].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || Date.parse(b.endAt) - Date.parse(a.endAt))
    let cluster: Array<{ segment: IntervalSegment, lane: number }> = []
    let clusterEnd = -Infinity
    const close = () => {
      const lanes = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 1)
      for (const item of cluster) result.set(segmentKey(item.segment), { lane: item.lane, lanes })
      cluster = []
    }
    for (const segment of sorted) {
      const start = Date.parse(segment.startAt)
      const end = Date.parse(segment.endAt)
      if (cluster.length && start >= clusterEnd) { close(); clusterEnd = -Infinity }
      const busy = new Set(cluster.filter(item => Date.parse(item.segment.endAt) > start).map(item => item.lane))
      let lane = 0
      while (busy.has(lane)) lane++
      cluster.push({ segment, lane })
      clusterEnd = Math.max(clusterEnd, end)
    }
    if (cluster.length) close()
  }
  return result
}
