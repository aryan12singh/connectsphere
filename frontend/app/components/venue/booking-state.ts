import type { CalendarBooking } from './calendar-state'

export interface BookingDraft {
  venueId: string
  title: string
  reason: string
  startAt: string
  endAt: string
  timeZone: string
  status: string
  eventId?: string | null
}

const BLOCKING_STATUSES = new Set(['BLOCKED', 'TENTATIVELY_HELD', 'CONFIRMED', 'UNAVAILABLE'])
const ALL_BOOKING_STATUSES = ['AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED'] as const

function overlaps(left: BookingDraft, right: CalendarBooking) {
  return new Date(left.startAt) < new Date(right.endAt) && new Date(right.startAt) < new Date(left.endAt)
}

export function bookingDraftState(draft: BookingDraft, existing: CalendarBooking[], excludeBookingId?: string | null, requiresEvent = false) {
  const errors: Record<string, string> = {}
  if (!draft.title.trim()) errors.title = 'Title is required.'
  if (!draft.reason.trim()) errors.reason = 'Reason is required.'
  if (!draft.timeZone.trim()) errors.timeZone = 'Time zone is required.'
  if (requiresEvent && !draft.eventId?.trim()) errors.eventId = 'Select an event.'
  if (!draft.startAt || !draft.endAt || Number.isNaN(Date.parse(draft.startAt)) || Number.isNaN(Date.parse(draft.endAt)) || new Date(draft.startAt) >= new Date(draft.endAt)) {
    errors.endAt = 'End time must be after start time.'
  }
  const affected = existing
    .filter(interval => interval.id !== excludeBookingId)
    .filter(interval => interval.venueId === undefined || interval.venueId === draft.venueId)
    .filter(interval => overlaps(draft, interval))
  if (draft.status !== 'BLOCKED' && affected.some(interval => BLOCKING_STATUSES.has(interval.status))) {
    errors.interval = 'This booking overlaps an unavailable interval.'
  }
  return {
    status: draft.status,
    errors,
    overlaps: affected.map(interval => interval.id),
    canSubmit: Object.keys(errors).length === 0,
  }
}

export function isBlockingStatus(status: string) {
  return BLOCKING_STATUSES.has(status)
}

export function canCreateBlock(canDecide: boolean) {
  return canDecide
}

export function bookingSelectionStatuses(canDecide: boolean, canSetAllStatuses = false) {
  if (canSetAllStatuses) return [...ALL_BOOKING_STATUSES]
  return canDecide ? ['CONFIRMED', 'BLOCKED', 'TENTATIVELY_HELD', 'UNAVAILABLE'] : ['TENTATIVELY_HELD']
}

export function coordinatorBookingEditState(booking: Pick<CalendarBooking, 'requestedById' | 'status'> | null | undefined, actorId: string | null | undefined) {
  const canEdit = Boolean(booking && actorId && booking.requestedById === actorId && ['TENTATIVELY_HELD', 'CANCELLED'].includes(booking.status))
  return {
    canEdit,
    readOnly: Boolean(booking) && !canEdit,
    statuses: canEdit ? ['TENTATIVELY_HELD', 'CANCELLED'] : booking ? [booking.status] : ['TENTATIVELY_HELD'],
  }
}

export function bookingDraftForSlot(venueId: string, timeZone: string, startAt: string, endAt: string): BookingDraft {
  return { venueId, title: '', reason: '', startAt, endAt, timeZone, status: 'TENTATIVELY_HELD', eventId: '' }
}

export function bookingDraftForExisting(booking: CalendarBooking): BookingDraft {
  const timeZone = booking.timeZone ?? 'Asia/Singapore'
  return {
    venueId: booking.venueId ?? '',
    title: booking.title,
    reason: booking.reason ?? '',
    startAt: calendarIsoToWallTime(booking.startAt, timeZone),
    endAt: calendarIsoToWallTime(booking.endAt, timeZone),
    timeZone,
    status: booking.status,
    eventId: booking.eventId ?? null,
  }
}

export function bookingMutation(bookingId?: string | null) {
  return bookingId
    ? { method: 'PUT' as const, path: `/api/bookings/${bookingId}` }
    : { method: 'POST' as const, path: '/api/bookings' }
}

/** Format an API instant as a venue-local datetime-local value. */
export function calendarIsoToWallTime(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

/** Convert a venue-local datetime input into an instant without using the browser timezone. */
export function calendarWallTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return new Date(value).toISOString()

  const [, year, month, day, hour, minute] = match
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(wallTime))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const zonedTime = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))
  return new Date(wallTime - (zonedTime - wallTime)).toISOString()
}

/**
 * Calendar coordinates represent wall-clock time in the venue's timezone.
 * Keep that local time in the form state; `VenueCalendar` converts it to an
 * instant only at the API boundary.
 */
export function bookingDraftForCalendarSlot(venueId: string, timeZone: string, day: string, startHour: number, durationMinutes: number): BookingDraft {
  const start = new Date(`${day}T00:00:00.000Z`)
  start.setUTCMinutes(startHour * 60)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return bookingDraftForSlot(venueId, timeZone, start.toISOString().slice(0, 16), end.toISOString().slice(0, 16))
}

export function bookingPopoverOffset(selectionBottom: number) {
  return selectionBottom + 8
}

export function calendarSelectionFromDrag(firstAt: string, secondAt: string) {
  const first = new Date(firstAt)
  const second = new Date(secondAt)
  const start = first <= second ? first : second
  const end = first <= second ? second : first
  return { startAt: start.toISOString(), endAt: end.toISOString(), durationMinutes: (end.getTime() - start.getTime()) / 60_000 }
}
