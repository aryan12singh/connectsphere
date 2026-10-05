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

export function calendarRange(mode: CalendarMode, activeDate: Date): CalendarRange {
  const day = startOfDay(activeDate)
  const weekday = (day.getUTCDay() + 6) % 7
  const start = mode === 'week' ? addDays(day, -weekday) : day
  const end = addDays(start, mode === 'week' ? 7 : 1)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}

export function advanceCalendarDate(mode: CalendarMode, activeDate: Date, direction: -1 | 1) {
  return addDays(startOfDay(activeDate), direction * (mode === 'week' ? 7 : 1))
}

export function intervalSegmentsForRange(bookings: CalendarBooking[], range: CalendarRange): IntervalSegment[] {
  const rangeStart = new Date(range.startAt)
  const rangeEnd = new Date(range.endAt)
  const uniqueBookings = bookings.filter((booking, index) => bookings.findIndex(candidate => candidate.id === booking.id) === index)
  return uniqueBookings.flatMap((booking) => {
    const start = new Date(booking.startAt)
    const end = new Date(booking.endAt)
    if (!(end > rangeStart && start < rangeEnd)) return []
    const firstDay = startOfDay(new Date(Math.max(start.getTime(), rangeStart.getTime())))
    const lastInstant = new Date(Math.min(end.getTime(), rangeEnd.getTime()) - 1)
    const lastDay = startOfDay(lastInstant)
    const segments: IntervalSegment[] = []
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      const nextDay = addDays(day, 1)
      segments.push({
        booking,
        day: day.toISOString().slice(0, 10),
        startAt: new Date(Math.max(start.getTime(), day.getTime())).toISOString(),
        endAt: new Date(Math.min(end.getTime(), nextDay.getTime())).toISOString(),
        kind: booking.status === 'BLOCKED' ? 'block' : 'booking',
      })
    }
    return segments
  })
}
