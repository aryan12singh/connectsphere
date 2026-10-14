const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { bookings: new Map(), activities: [], idempotency: new Map(), outbox: [], primaryVenues:new Map() };
const clock = require('./clock');
let memoryTail = Promise.resolve();

function id() { return crypto.randomUUID(); }
function now() { return clock.now().toISOString(); }
function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function safeJson(value) { return JSON.parse(JSON.stringify(value)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function fingerprint(payload) { return crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex'); }
const metadataKeys = ['expiresAt','expectedAttendance','layout','facilities','accessibilityNeeds','required','setupMinutes','turnaroundMinutes','occupiedStart','occupiedEnd','venueVersion','requirements','requirementsFingerprint','flags'];
function metadata(input, dates = false) {
  return Object.fromEntries(metadataKeys.filter(key=>input[key] !== undefined).map(key=>[key, dates && key==='requirements' && input[key]===null ? require('@prisma/client').Prisma.DbNull : dates && ['expiresAt','occupiedStart','occupiedEnd'].includes(key) && input[key] ? new Date(input[key]) : input[key]]));
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
    version: booking.version ?? 1,
    expiresAt: iso(booking.expiresAt) || null,
    expectedAttendance: booking.expectedAttendance ?? null,
    layout: booking.layout || null,
    facilities: booking.facilities || [],
    accessibilityNeeds: booking.accessibilityNeeds || [],
    required: booking.required ?? true,
    setupMinutes: booking.setupMinutes ?? 0,
    turnaroundMinutes: booking.turnaroundMinutes ?? 0,
    occupiedStart: iso(booking.occupiedStart || booking.startAt || booking.requestedStart),
    occupiedEnd: iso(booking.occupiedEnd || booking.endAt || booking.requestedEnd),
    venueVersion: booking.venueVersion ?? 0,
    requirements: booking.requirements || null,
    requirementsFingerprint: booking.requirementsFingerprint || null,
    flags: booking.flags || [],
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
    venueId: activity.venueId || activity.changes?.after?.venueId || activity.changes?.before?.venueId || activity.booking?.venueId,
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
    state.primaryVenues.clear();
    state.activities.length = 0;
    state.idempotency.clear();
    state.outbox.length = 0;
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

function createBooking(input, actor, key, transaction) {
  if (isMemory) {
    const timestamp = input.createdAt || now();
    const booking = {
      id: id(), eventId: input.eventId || null, venueId: input.venueId,
      requestedById: actor.id, title: input.title, reason: input.reason,
      startAt: input.startAt, endAt: input.endAt, timeZone: input.timeZone,
      status: input.status, idempotencyKey: key,
      statusChangedById: actor.id, statusChangedRole: actor.role, statusChangedAt: timestamp,
      statusReason: input.reason, createdAt: timestamp, updatedAt: timestamp,
      version:1, expiresAt:null, expectedAttendance:null, layout:null, facilities:[], accessibilityNeeds:[], required:true,
      setupMinutes:0,turnaroundMinutes:0,occupiedStart:input.startAt,occupiedEnd:input.endAt,venueVersion:0,flags:[],
      ...metadata(input),requestFingerprint:input.requestFingerprint || fingerprint(input),
    };
    state.bookings.set(booking.id, booking);
    state.idempotency.set(`${actor.id}:${key}`, { fingerprint: booking.requestFingerprint, bookingId: booking.id });
    appendActivity(booking, actor, 'BOOKING_CREATED', input.reason, { after: booking }, null, booking.status);
    return booking;
  }
  const save = async (tx) => {
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
        ...(input.createdAt?{createdAt:new Date(input.createdAt),updatedAt:new Date(input.createdAt),statusChangedAt:new Date(input.createdAt)}:{}),
        ...metadata(input,true),
        requestFingerprint:input.requestFingerprint || fingerprint(input),
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
  };
  return transaction ? save(transaction) : prisma.$transaction(save);
}

function replaceBooking(current, input, actor, transaction) {
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
      ...metadata(input), version:(current.version ?? 1)+1,
    };
    if (before.status !== updated.status) {
      updated.statusChangedById = actor.id;
      updated.statusChangedRole = actor.role;
      updated.statusChangedAt = updated.updatedAt;
      updated.statusReason = input.reason;
    }
    state.bookings.set(current.id, updated);
    appendActivity(updated, actor, input.activityAction || (before.status !== updated.status ? 'STATUS_CHANGED' : 'BOOKING_UPDATED'), input.activityReason || input.reason, { before, after: updated }, before.status, updated.status);
    return updated;
  }
  const save = async (tx) => {
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
        ...metadata(input,true), version:{increment:1},
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
        action: input.activityAction || (changedStatus ? 'STATUS_CHANGED' : 'BOOKING_UPDATED'),
        fromStatus: beforeRecord.status,
        toStatus: updatedRecord.status,
        reason: input.activityReason || input.reason,
        changes: safeJson({ before, after }),
      },
    });
    return after;
  };
  return transaction ? save(transaction) : prisma.$transaction(save);
}

function findIdempotency(actorId, key, transaction) {
  if (isMemory) return state.idempotency.get(`${actorId}:${key}`) || null;
  return (transaction || prisma).venueBookingRequest.findUnique({
    where: { requestedById_idempotencyKey: { requestedById: actorId, idempotencyKey: key } },
  }).then((booking) => booking ? { fingerprint: booking.requestFingerprint || fingerprint({
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

function getBooking(idValue, transaction) {
  if (isMemory) return state.bookings.get(idValue) || null;
  return (transaction || prisma).venueBookingRequest.findUnique({ where: { id: idValue } }).then(toApiBooking);
}

function listBookings(transaction, where = {}) {
  if (isMemory) return [...state.bookings.values()].filter(row=>Object.entries(where).every(([key,value])=>row[key]===value));
  return (transaction || prisma).venueBookingRequest.findMany({ where,orderBy: { createdAt: 'asc' } }).then((items) => items.map(toApiBooking));
}

async function withLocks(keys, work) {
  if (!isMemory) return prisma.$transaction(async tx=>{
    for (const key of [...new Set(keys)].sort()) await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const [row] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    return work(tx,row.now);
  }, {timeout:30000,maxWait:10000});
  let release;
  const preceding = memoryTail;
  memoryTail = new Promise(resolve=>{release=resolve;});
  await preceding;
  const saved = safeJson({bookings:[...state.bookings],activities:state.activities,idempotency:[...state.idempotency],outbox:state.outbox,primaryVenues:[...state.primaryVenues]});
  try { return await work(null,clock.now()); }
  catch (error) { state.bookings=new Map(saved.bookings);state.activities=saved.activities;state.idempotency=new Map(saved.idempotency);state.outbox=saved.outbox;state.primaryVenues=new Map(saved.primaryVenues);throw error; }
  finally {release();}
}

async function lockMore(transaction,keys) {
  if (transaction) for (const key of [...new Set(keys)].sort()) await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
async function transactionNow(transaction) {
  if (!transaction) return clock.now();
  const [row]=await transaction.$queryRaw`SELECT clock_timestamp() AS now`;
  return row.now;
}

function addOutbox(booking,kind,payload,transaction) {
  const actionKey=`${booking.id}:${booking.version}:${kind}`;
  if (isMemory) {
    const existing=state.outbox.find(row=>row.actionKey===actionKey);
    if (existing) return existing;
    const row={id:id(),actionKey,aggregateId:booking.id,kind,payload:safeJson(payload),createdAt:now(),deliveredAt:null};state.outbox.push(row);return row;
  }
  return (transaction || prisma).bookingOutbox.upsert({where:{actionKey},create:{actionKey,aggregateId:booking.id,kind,payload:safeJson(payload)},update:{}});
}

function listHistory(venueId) {
  if (isMemory) {
    const initialVenues=new Map();
    for(const entry of [...state.activities].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))) {
      const initial=entry.changes?.before?.venueId || entry.changes?.after?.venueId;
      if(initial && !initialVenues.has(entry.bookingId))initialVenues.set(entry.bookingId,initial);
    }
    return state.activities
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        const before=entry.changes?.before?.venueId,after=entry.changes?.after?.venueId;
        return before===venueId || after===venueId || !before && !after && (initialVenues.get(entry.bookingId) || entry.venueId)===venueId;
      })
      .sort((a, b) => b.entry.occurredAt.localeCompare(a.entry.occurredAt) || b.index - a.index)
      .map(({ entry }) => ({...entry,venueId}));
  }
  // Movement belongs to both venues. Creation remains at its immutable origin.
  // Snapshotless seed activity is anchored to the earliest known snapshot;
  // bookings with no snapshot at all retain their existing venue fallback.
  return prisma.$queryRaw`
    SELECT activity.*, ${venueId}::text AS "venueId"
    FROM venue_booking_activity activity
    JOIN venue_booking_requests booking ON booking.id=activity."bookingId"
    LEFT JOIN LATERAL (
      SELECT COALESCE(first.changes #>> '{before,venueId}', first.changes #>> '{after,venueId}') AS venue
      FROM venue_booking_activity first
      WHERE first."bookingId"=activity."bookingId"
        AND COALESCE(first.changes #>> '{before,venueId}', first.changes #>> '{after,venueId}') IS NOT NULL
      ORDER BY first."occurredAt",first.id LIMIT 1
    ) origin ON true
    WHERE activity.changes #>> '{before,venueId}'=${venueId}
      OR activity.changes #>> '{after,venueId}'=${venueId}
      OR (activity.changes #>> '{before,venueId}' IS NULL AND activity.changes #>> '{after,venueId}' IS NULL
        AND COALESCE(origin.venue,booking."venueId")=${venueId})
    ORDER BY activity."occurredAt" DESC,activity.id DESC
  `.then(items=>items.map(toApiActivity));
}

function countBlockingBookings(venueId, at = clock.now()) {
  const statuses = new Set(['TENTATIVELY_HELD', 'CONFIRMED']);
  const instant = at instanceof Date ? at : new Date(at);
  if (isMemory) {
    return [...state.bookings.values()].filter((booking) => statuses.has(booking.status)
      && booking.venueId === venueId
      && new Date(booking.occupiedEnd || booking.endAt || booking.requestedEnd) >= instant
      && (booking.status==='CONFIRMED' || booking.expiresAt && new Date(booking.expiresAt)>instant)).length;
  }
  return prisma.venueBookingRequest.count({
    where: {
      venueId,
      OR:[{status:'CONFIRMED'},{status:'TENTATIVELY_HELD',expiresAt:{gt:instant}}],
      AND:[{OR:[{occupiedEnd:{gte:instant}},{occupiedEnd:null,requestedEnd:{gte:instant}}]}],
    },
  });
}

function primaryVenue(eventId,transaction) {
  if(isMemory)return state.primaryVenues.get(eventId) || {eventId,bookingId:null,version:0};
  return (transaction || prisma).eventPrimaryVenue.findUnique({where:{eventId}}).then(row=>row?{...row,updatedAt:iso(row.updatedAt)}:{eventId,bookingId:null,version:0});
}
async function setPrimaryVenue(eventId,booking,actor,current,transaction) {
  const next={eventId,bookingId:booking.id,version:current.version+1,actorId:actor.id,updatedAt:now()};
  const changes={primaryVenue:{before:current,after:next},before:{venueId:booking.venueId},after:{venueId:booking.venueId}};
  if(isMemory){state.primaryVenues.set(eventId,next);appendActivity(booking,actor,'PRIMARY_VENUE_SELECTED','Designate the primary attendee location',changes,booking.status,booking.status);}
  else {
    await transaction.eventPrimaryVenue.upsert({where:{eventId},create:next,update:next});
    await transaction.venueBookingActivity.create({data:{bookingId:booking.id,actorId:actor.id,actorRole:actor.role,action:'PRIMARY_VENUE_SELECTED',reason:'Designate the primary attendee location',fromStatus:booking.status,toStatus:booking.status,changes:safeJson(changes)}});
  }
  return next;
}

module.exports = {
  primaryVenue,setPrimaryVenue,
  state, reset, fingerprint, createBooking, replaceBooking, appendActivity,
  findIdempotency, getBooking, listBookings, listHistory, countBlockingBookings, isMemory,
  withLocks,lockMore,transactionNow,addOutbox,toApiBooking,
};
