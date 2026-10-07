// Who may do what with a venue booking. Business rules decided 2026-10-07:
//
//   * Only Event Coordinators create venue bookings (permission
//     `venue_bookings.create`). Venue Staff cannot create bookings or block
//     out time on the calendar.
//   * Only Venue Staff change a venue booking's status (permission
//     `venue_bookings.decide`). A coordinator may edit the details of their
//     own booking while it is still TENTATIVELY_HELD, but never its status.
//   * A coordinator sees their own bookings in full. Other people's bookings
//     are shown only as "not available": no title, reason, event or person.
//
// Every check here uses permissions, never role names, so tech support can
// change who may do what in the permissions screen (auth_db.role_permissions).

// Statuses that make the venue unavailable for that time.
const BLOCKING_STATUSES = new Set(['TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE']);

// Statuses Venue Staff may set. BLOCKED and AVAILABLE are left out: staff do
// not block out time on the calendar (2026-10-07). Existing BLOCKED rows from
// the seed data are still shown as unavailable.
const DECIDER_STATUSES = ['TENTATIVELY_HELD', 'CONFIRMED', 'REJECTED', 'UNAVAILABLE', 'CANCELLED'];

// The only status a new booking can have.
const CREATE_STATUS = 'TENTATIVELY_HELD';

function hasPermission(actor, permission) {
  return Array.isArray(actor?.permissions) && actor.permissions.includes(permission);
}

// May create bookings (Event Coordinators by default).
function canCreate(actor) {
  return hasPermission(actor, 'venue_bookings.create');
}

// May change booking status and see every booking (Venue Staff by default).
function canDecide(actor) {
  return hasPermission(actor, 'venue_bookings.decide');
}

function ownsBooking(booking, actor) {
  return Boolean(booking && actor && booking.requestedById === actor.id);
}

// A coordinator may edit their own booking's details while it is pending.
function canEditDetails(booking, actor) {
  return canCreate(actor) && ownsBooking(booking, actor) && booking.status === 'TENTATIVELY_HELD';
}

// May this actor read this booking in full?
function canViewFull(booking, actor) {
  return canDecide(actor) || ownsBooking(booking, actor);
}

function isBlocking(status) {
  return BLOCKING_STATUSES.has(status);
}

/**
 * What a caller may see of one booking on the availability calendar.
 * Returns the booking itself, a "not available" slot with only the times,
 * or null (someone else's booking that does not block the venue).
 */
function availabilityView(booking, actor) {
  if (canViewFull(booking, actor)) return booking;
  if (!isBlocking(booking.status)) return null;
  return {
    // Built from the public times only, so it says nothing about the booking.
    id: `unavailable-${booking.startAt}-${booking.endAt}`,
    venueId: booking.venueId,
    startAt: booking.startAt,
    endAt: booking.endAt,
    status: 'NOT_AVAILABLE',
    title: 'Not available',
  };
}

module.exports = {
  BLOCKING_STATUSES,
  DECIDER_STATUSES,
  CREATE_STATUS,
  canCreate,
  canDecide,
  ownsBooking,
  canEditDetails,
  canViewFull,
  isBlocking,
  availabilityView,
};
