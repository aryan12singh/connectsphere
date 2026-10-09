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

function zonedParts(instant: Date, timeZone: string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]))
}

function localToInstant(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Use a valid date and clock time')
  }
  const dateValue = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) {
    throw new Error('Use a valid date and clock time')
  }

  const wallTime = Date.parse(`${date}T${time}:00Z`)
  const offsets = new Set<number>()
  for (const days of [-2, -1, 0, 1, 2]) {
    const sample = new Date(wallTime + days * 86_400_000)
    const parts = zonedParts(sample, timeZone)
    offsets.add(Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`) - sample.getTime())
  }

  const matches = [...offsets]
    .map(offset => new Date(wallTime - offset))
    .filter((instant) => {
      const parts = zonedParts(instant, timeZone)
      return `${parts.year}-${parts.month}-${parts.day}` === date && `${parts.hour}:${parts.minute}` === time
    })
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'This clock time occurs twice. Choose an unambiguous time.' : 'This clock time does not exist in the selected time zone.')
  }
  return matches[0]
}

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

/** Staff decision permission creates operational windows, not ordinary bookings. */
export function venueStaffCreationState(editing: boolean) {
  return {
    initialStatus: 'BLOCKED',
    statuses: editing
      ? bookingSelectionStatuses(false, true).filter(status => status !== 'AVAILABLE')
      : ['BLOCKED', 'UNAVAILABLE'],
  }
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

  return localToInstant(value.slice(0, 10), value.slice(11, 16), timeZone)!.toISOString()
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
