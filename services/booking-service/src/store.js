const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { bookings: new Map(), activities: [], idempotency: new Map() };

// Statuses that make the venue unavailable (same list as policy.js).
const BLOCKING = ['TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE'];

// Thrown when the requested time overlaps a booking that blocks the venue.
// The message says nothing about the other booking (who, what or why).
class BookingConflictError extends Error {
  constructor() {
    super('The venue is not available for the selected time');
    this.code = 'BOOKING_CONFLICT';
  }
}

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function safeJson(value) { return JSON.parse(JSON.stringify(value)); }
// What makes two create requests "the same" for Idempotency-Key checks.
// Times are compared as instants (…Z and +08:00 forms of the same time
// match). Status is left out: every new booking starts TENTATIVELY_HELD and
// Venue Staff may change it later, which must not turn a retry into a 409.
function fingerprint(payload) {
  const fields = {
    eventId: payload.eventId || null,
    venueId: payload.venueId,
    title: payload.title,
    reason: payload.reason,
    startAt: new Date(payload.startAt).toISOString(),
    endAt: new Date(payload.endAt).toISOString(),
    timeZone: payload.timeZone,
  };
  return JSON.stringify(fields, Object.keys(fields).sort());
}

function toApiBooking(booking) {
  if (!booking) return null;
  return {
    id: booking.id,
    eventId: booking.eventId || null,
    venueId: booking.venueId,
    requestedById: booking.requestedById,
    title: booking.title,
    reason: booking.reason,
    startAt: iso(booking.startAt || booking.requestedStart),
    endAt: iso(booking.endAt || booking.requestedEnd),
    timeZone: booking.timeZone,
    status: booking.status,
    idempotencyKey: booking.idempotencyKey,
    statusChangedById: booking.statusChangedById || null,
    statusChangedRole: booking.statusChangedRole || null,
    statusChangedAt: iso(booking.statusChangedAt),
    statusReason: booking.statusReason || null,
    createdAt: iso(booking.createdAt),
    updatedAt: iso(booking.updatedAt),
  };
}

function toApiActivity(activity) {
  if (!activity) return null;
  return {
    id: activity.id,
    source: 'BOOKING',
    bookingId: activity.bookingId,
    venueId: activity.booking?.venueId || activity.venueId,
    actorId: activity.actorId,
    actorRole: activity.actorRole,
    action: activity.action,
    fromStatus: activity.fromStatus || null,
    toStatus: activity.toStatus || null,
    reason: activity.reason,
    changes: activity.changes,
    occurredAt: iso(activity.occurredAt),
    // Used only to decide who may read this entry; never trusted from callers.
    requestedById: activity.booking?.requestedById || activity.requestedById || null,
  };
}

// Do two time ranges overlap? Touching ends (10:00–11:00, 11:00–12:00) do not.
function overlaps(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

// Memory mode: throw if a blocking booking overlaps the given time.
function assertNoConflictInMemory(venueId, startAt, endAt, excludeId) {
  const clash = [...state.bookings.values()].some((booking) => booking.id !== excludeId
    && booking.venueId === venueId
    && BLOCKING.includes(booking.status)
    && overlaps(startAt, endAt, booking.startAt || booking.requestedStart, booking.endAt || booking.requestedEnd));
  if (clash) throw new BookingConflictError();
}

// Database mode: lock this venue for the rest of the transaction, then look
// for an overlapping blocking booking. The lock makes two simultaneous
// requests for the same venue run one after the other, so both cannot pass
// the check. $executeRaw with a template literal sends venueId as a query
// parameter, never as SQL text.
async function lockVenueAndCheck(tx, venueId, startAt, endAt, excludeId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${venueId}))`;
  const clash = await tx.venueBookingRequest.count({
    where: {
      venueId,
      status: { in: BLOCKING },
      requestedStart: { lt: new Date(endAt) },
      requestedEnd: { gt: new Date(startAt) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash > 0) throw new BookingConflictError();
}

function reset() {
  if (isMemory) {
    state.bookings.clear();
    state.activities.length = 0;
    state.idempotency.clear();
  }
}

function appendActivity(booking, actor, action, reason, changes, fromStatus, toStatus) {
  const entry = {
    id: id(), source: 'BOOKING', bookingId: booking.id, venueId: booking.venueId,
    actorId: actor.id, actorRole: actor.role, action,
    fromStatus: fromStatus || null, toStatus: toStatus || null, reason, changes, occurredAt: now(),
  };
  state.activities.push(entry);
  return entry;
}

function createBooking(input, actor, key) {
  if (isMemory) {
    if (BLOCKING.includes(input.status)) assertNoConflictInMemory(input.venueId, input.startAt, input.endAt, null);
    const timestamp = now();
    const booking = {
      id: id(), eventId: input.eventId || null, venueId: input.venueId,
      requestedById: actor.id, title: input.title, reason: input.reason,
      startAt: input.startAt, endAt: input.endAt, timeZone: input.timeZone,
      status: input.status, idempotencyKey: key,
      statusChangedById: actor.id, statusChangedRole: actor.role, statusChangedAt: timestamp,
      statusReason: input.reason, createdAt: timestamp, updatedAt: timestamp,
    };
    state.bookings.set(booking.id, booking);
    state.idempotency.set(`${actor.id}:${key}`, { fingerprint: fingerprint(input), bookingId: booking.id });
    appendActivity(booking, actor, 'BOOKING_CREATED', input.reason, { after: booking }, null, booking.status);
    return booking;
  }
  return prisma.$transaction(async (tx) => {
    if (BLOCKING.includes(input.status)) await lockVenueAndCheck(tx, input.venueId, input.startAt, input.endAt, null);
    const created = await tx.venueBookingRequest.create({
      data: {
        eventId: input.eventId || null,
        venueId: input.venueId,
        requestedById: actor.id,
        title: input.title,
        reason: input.reason,
        requestedStart: new Date(input.startAt),
        requestedEnd: new Date(input.endAt),
        timeZone: input.timeZone,
        status: input.status,
        idempotencyKey: key,
        statusChangedById: actor.id,
        statusChangedRole: actor.role,
        statusChangedAt: new Date(),
        statusReason: input.reason,
      },
    });
    const apiBooking = toApiBooking(created);
    await tx.venueBookingActivity.create({
      data: {
        bookingId: created.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'BOOKING_CREATED',
        fromStatus: null,
        toStatus: created.status,
        reason: input.reason,
        changes: safeJson({ after: apiBooking }),
      },
    });
    return apiBooking;
  });
}

/**
 * Saves a changed booking and records who changed it.
 * `input.reason` is the booking's own reason. `statusReason` is the reason
 * Venue Staff gave for a status change; it is recorded on the activity entry
 * and in statusReason, and leaves the booking's reason alone.
 */
function replaceBooking(current, input, actor, statusReason) {
  const activityReason = statusReason || input.reason;
  if (isMemory) {
    if (BLOCKING.includes(input.status)) assertNoConflictInMemory(input.venueId, input.startAt, input.endAt, current.id);
    const before = { ...current };
    const updated = {
      ...current,
      eventId: input.eventId ?? current.eventId,
      venueId: input.venueId,
      title: input.title,
      reason: input.reason,
      startAt: input.startAt,
      endAt: input.endAt,
      timeZone: input.timeZone,
      status: input.status,
      updatedAt: now(),
    };
    if (before.status !== updated.status) {
      updated.statusChangedById = actor.id;
      updated.statusChangedRole = actor.role;
      updated.statusChangedAt = updated.updatedAt;
      updated.statusReason = activityReason;
    }
    state.bookings.set(current.id, updated);
    appendActivity(updated, actor, before.status !== updated.status ? 'STATUS_CHANGED' : 'BOOKING_UPDATED', activityReason, { before, after: updated }, before.status, updated.status);
    return updated;
  }
  return prisma.$transaction(async (tx) => {
    if (BLOCKING.includes(input.status)) await lockVenueAndCheck(tx, input.venueId, input.startAt, input.endAt, current.id);
    const beforeRecord = await tx.venueBookingRequest.findUnique({ where: { id: current.id } });
    if (!beforeRecord) return null;
    const changedStatus = beforeRecord.status !== input.status;
    const updatedRecord = await tx.venueBookingRequest.update({
      where: { id: current.id },
      data: {
        eventId: input.eventId ?? beforeRecord.eventId,
        venueId: input.venueId,
        title: input.title,
        reason: input.reason,
        requestedStart: new Date(input.startAt),
        requestedEnd: new Date(input.endAt),
        timeZone: input.timeZone,
        status: input.status,
        ...(changedStatus ? {
          statusChangedById: actor.id,
          statusChangedRole: actor.role,
          statusChangedAt: new Date(),
          statusReason: activityReason,
        } : {}),
      },
    });
    const before = toApiBooking(beforeRecord);
    const after = toApiBooking(updatedRecord);
    await tx.venueBookingActivity.create({
      data: {
        bookingId: current.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: changedStatus ? 'STATUS_CHANGED' : 'BOOKING_UPDATED',
        fromStatus: beforeRecord.status,
        toStatus: updatedRecord.status,
        reason: activityReason,
        changes: safeJson({ before, after }),
      },
    });
    return after;
  });
}

function findIdempotency(actorId, key) {
  if (isMemory) return state.idempotency.get(`${actorId}:${key}`) || null;
  return prisma.venueBookingRequest.findUnique({
    where: { requestedById_idempotencyKey: { requestedById: actorId, idempotencyKey: key } },
  }).then((booking) => booking ? { fingerprint: fingerprint({
    eventId: booking.eventId || null,
    venueId: booking.venueId,
    title: booking.title,
    reason: booking.reason,
    startAt: iso(booking.requestedStart),
    endAt: iso(booking.requestedEnd),
    timeZone: booking.timeZone,
  }), bookingId: booking.id } : null);
}

function getBooking(idValue) {
  if (isMemory) return state.bookings.get(idValue) || null;
  return prisma.venueBookingRequest.findUnique({ where: { id: idValue } }).then(toApiBooking);
}

function listBookings() {
  if (isMemory) return [...state.bookings.values()];
  return prisma.venueBookingRequest.findMany({ orderBy: { createdAt: 'asc' } }).then((items) => items.map(toApiBooking));
}

function listHistory(venueId) {
  if (isMemory) {
    return state.activities
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.venueId === venueId)
      .sort((a, b) => b.entry.occurredAt.localeCompare(a.entry.occurredAt) || b.index - a.index)
      .map(({ entry }) => ({ ...entry, requestedById: state.bookings.get(entry.bookingId)?.requestedById || null }));
  }
  return prisma.venueBookingActivity.findMany({
    where: { booking: { venueId } },
    include: { booking: { select: { venueId: true, requestedById: true } } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  }).then((items) => items.map(toApiActivity));
}

function countBlockingBookings(venueId, at = new Date()) {
  const statuses = new Set(['TENTATIVELY_HELD', 'CONFIRMED']);
  const instant = at instanceof Date ? at : new Date(at);
  if (isMemory) {
    return [...state.bookings.values()].filter((booking) => statuses.has(booking.status)
      && booking.venueId === venueId
      && new Date(booking.endAt || booking.requestedEnd) >= instant).length;
  }
  return prisma.venueBookingRequest.count({
    where: {
      venueId,
      status: { in: [...statuses] },
      requestedEnd: { gte: instant },
    },
  });
}

module.exports = {
  BookingConflictError, overlaps,
  state, reset, fingerprint, createBooking, replaceBooking, appendActivity,
  findIdempotency, getBooking, listBookings, listHistory, countBlockingBookings, isMemory,
};
