import { localToInstant } from '../../../../services/event-service/src/domain/validation.js'
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

// Business rules (2026-10-07): only Event Coordinators create bookings; only
// Venue Staff change a booking's status; other people's bookings arrive from
// the server as NOT_AVAILABLE slots with times only. The server enforces all
// of this again; these helpers only shape the screen.

// NOT_AVAILABLE is how the server shows someone else's booking to a coordinator.
const BLOCKING_STATUSES = new Set(['BLOCKED', 'TENTATIVELY_HELD', 'CONFIRMED', 'UNAVAILABLE', 'NOT_AVAILABLE'])
// Statuses Venue Staff may set (no BLOCKED: staff do not block out time).
const VENUE_STAFF_STATUSES = ['TENTATIVELY_HELD', 'CONFIRMED', 'REJECTED', 'UNAVAILABLE', 'CANCELLED'] as const

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
  if (affected.some(interval => BLOCKING_STATUSES.has(interval.status))) {
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

/** Only users with `venue_bookings.create` (Event Coordinators) create bookings. */
export function canCreateBooking(hasCreatePermission: boolean) {
  return hasCreatePermission
}

/** Statuses the user may pick: Venue Staff get the decision list; nobody else changes status. */
export function bookingSelectionStatuses(canDecide: boolean) {
  return canDecide ? [...VENUE_STAFF_STATUSES] : ['TENTATIVELY_HELD']
}

/** A slot the server sent without details (someone else's booking). */
export function isHiddenBooking(booking: Pick<CalendarBooking, 'status'>) {
  return booking.status === 'NOT_AVAILABLE'
}

/**
 * A coordinator may edit the details of their own booking while it is
 * TENTATIVELY_HELD. The status never changes here: Venue Staff decide it.
 */
export function coordinatorBookingEditState(booking: Pick<CalendarBooking, 'requestedById' | 'status'> | null | undefined, actorId: string | null | undefined) {
  const canEdit = Boolean(booking && actorId && booking.requestedById === actorId && booking.status === 'TENTATIVELY_HELD')
  return {
    canEdit,
    readOnly: Boolean(booking) && !canEdit,
    statuses: booking ? [booking.status] : ['TENTATIVELY_HELD'],
  }
}

/** The request body for Venue Staff: status and their reason only. */
export function statusChangeBody(status: string, reason: string) {
  return { status, reason: reason.trim() }
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
