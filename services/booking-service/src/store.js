const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { bookings: new Map(), activities: [], idempotency: new Map() };

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function safeJson(value) { return JSON.parse(JSON.stringify(value)); }
function fingerprint(payload) { return JSON.stringify(payload, Object.keys(payload).sort()); }

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
  };
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

function replaceBooking(current, input, actor) {
  if (isMemory) {
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
      updated.statusReason = input.reason;
    }
    state.bookings.set(current.id, updated);
    appendActivity(updated, actor, before.status !== updated.status ? 'STATUS_CHANGED' : 'BOOKING_UPDATED', input.reason, { before, after: updated }, before.status, updated.status);
    return updated;
  }
  return prisma.$transaction(async (tx) => {
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
          statusReason: input.reason,
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
        reason: input.reason,
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
    status: booking.status,
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
      .map(({ entry }) => entry);
  }
  return prisma.venueBookingActivity.findMany({
    where: { booking: { venueId } },
    include: { booking: { select: { venueId: true } } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  }).then((items) => items.map(toApiActivity));
}

module.exports = {
  state, reset, fingerprint, createBooking, replaceBooking, appendActivity,
  findIdempotency, getBooking, listBookings, listHistory, isMemory,
};
