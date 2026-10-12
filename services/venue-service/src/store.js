const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { venues: new Map(), history: [], outbox: [] };

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function safeJson(value) { return JSON.parse(JSON.stringify(value)); }

function toApiHours(hours = []) {
  return hours.map((hour) => ({
    id: hour.id,
    venueId: hour.venueId,
    weekday: hour.weekday,
    isClosed: hour.isClosed,
    opensAt: hour.opensAt,
    closesAt: hour.closesAt,
  }));
}

function toApiVenue(venue) {
  if (!venue) return null;
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    capacity: venue.capacity,
    venueType: venue.venueType,
    supportedLayouts: [...(venue.supportedLayouts || [])],
    facilities: [...(venue.facilities || [])],
    accessibilityTags: [...(venue.accessibilityTags || [])],
    timeZone: venue.timeZone,
    isActive: venue.isActive,
    managedById: venue.managedById,
    setupMinutes: venue.setupMinutes ?? 0,
    turnaroundMinutes: venue.turnaroundMinutes ?? 0,
    version: venue.version ?? 1,
    operatingHours: toApiHours(venue.operatingHours),
    createdAt: iso(venue.createdAt),
    updatedAt: iso(venue.updatedAt),
  };
}

function toApiHistory(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    venueId: entry.venueId,
    source: 'VENUE',
    action: entry.action,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    reason: entry.reason,
    changes: entry.changes,
    occurredAt: iso(entry.occurredAt),
  };
}

function reset() {
  if (isMemory) {
    state.venues.clear();
    state.history.length = 0;
    state.outbox.length = 0;
  }
}

function recordHistory(venueId, actor, action, reason, changes) {
  const entry = {
    id: id(), venueId, source: 'VENUE', action,
    actorId: actor.id, actorRole: actor.role, reason, changes, occurredAt: now(),
  };
  state.history.push(entry);
  return entry;
}

function createVenue(input, actor) {
  if (isMemory) {
    const timestamp = now();
    const venue = {
      id: id(), name: input.name, address: input.address, capacity: input.capacity,
      venueType: input.venueType, supportedLayouts: [...input.supportedLayouts],
      facilities: [...input.facilities], accessibilityTags: [...input.accessibilityTags],
      timeZone: input.timeZone, isActive: input.isActive ?? true,
      managedById: input.managedById,
      setupMinutes: input.setupMinutes ?? 0, turnaroundMinutes: input.turnaroundMinutes ?? 0, version: 1,
      operatingHours: input.operatingHours.map((hour) => ({ ...hour, id: hour.id || id() })),
      createdAt: timestamp, updatedAt: timestamp,
    };
    state.venues.set(venue.id, venue);
    recordHistory(venue.id, actor, 'VENUE_CREATED', input.reason || 'Venue created', { created: venue });
    return venue;
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.venue.create({
      data: {
        name: input.name, address: input.address, capacity: input.capacity,
        venueType: input.venueType, supportedLayouts: input.supportedLayouts,
        facilities: input.facilities, accessibilityTags: input.accessibilityTags,
        timeZone: input.timeZone, isActive: input.isActive ?? true, managedById: input.managedById,
        setupMinutes: input.setupMinutes ?? 0, turnaroundMinutes: input.turnaroundMinutes ?? 0,
      },
    });
    await tx.venueOperatingHour.createMany({
      data: input.operatingHours.map((hour) => ({
        id: hour.id || id(),
        venueId: created.id,
        weekday: hour.weekday,
        isClosed: Boolean(hour.isClosed),
        opensAt: hour.opensAt || null,
        closesAt: hour.closesAt || null,
      })),
    });
    const saved = await tx.venue.findUnique({ where: { id: created.id }, include: { operatingHours: true } });
    const apiVenue = toApiVenue(saved);
    await tx.venueHistory.create({
      data: {
        venueId: created.id, actorId: actor.id, actorRole: actor.role,
        action: 'VENUE_CREATED', reason: input.reason || 'Venue created',
        changes: safeJson({ created: apiVenue }),
      },
    });
    return apiVenue;
  });
}

function replaceVenue(idValue, input, actor) {
  if (isMemory) {
    const current = state.venues.get(idValue);
    if (!current) return null;
    checkVersion(current,input.version);
    const updated = {
      ...current, name: input.name, address: input.address, capacity: input.capacity,
      venueType: input.venueType, supportedLayouts: [...input.supportedLayouts],
      facilities: [...input.facilities], accessibilityTags: [...input.accessibilityTags],
      timeZone: input.timeZone, isActive: input.isActive, managedById: input.managedById, updatedAt: now(),
      setupMinutes: input.setupMinutes ?? current.setupMinutes ?? 0,
      turnaroundMinutes: input.turnaroundMinutes ?? current.turnaroundMinutes ?? 0,
      version: (current.version ?? 1) + 1,
      operatingHours: input.operatingHours.map((hour) => ({ ...hour, id: hour.id || id(), venueId: idValue })),
    };
    state.venues.set(idValue, updated);
    recordHistory(idValue, actor, 'VENUE_UPDATED', input.reason || 'Venue updated', { before: current, after: updated });
    enqueueRecheck(updated,actor,input.reason || 'Venue updated');
    return updated;
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM venues WHERE id = ${idValue} FOR UPDATE`;
    const current = await tx.venue.findUnique({ where: { id: idValue }, include: { operatingHours: true } });
    if (!current) return null;
    checkVersion(current,input.version);
    await tx.venue.update({
      where: { id: idValue },
      data: {
        name: input.name, address: input.address, capacity: input.capacity,
        venueType: input.venueType, supportedLayouts: input.supportedLayouts,
        facilities: input.facilities, accessibilityTags: input.accessibilityTags,
        timeZone: input.timeZone, isActive: input.isActive, managedById: input.managedById,
        setupMinutes: input.setupMinutes ?? current.setupMinutes ?? 0,
        turnaroundMinutes: input.turnaroundMinutes ?? current.turnaroundMinutes ?? 0,
        version: { increment: 1 },
      },
    });
    await tx.venueOperatingHour.deleteMany({ where: { venueId: idValue } });
    await tx.venueOperatingHour.createMany({
      data: input.operatingHours.map((hour) => ({
        id: hour.id || id(),
        venueId: idValue,
        weekday: hour.weekday,
        isClosed: Boolean(hour.isClosed),
        opensAt: hour.opensAt || null,
        closesAt: hour.closesAt || null,
      })),
    });
    const updated = await tx.venue.findUnique({ where: { id: idValue }, include: { operatingHours: true } });
    const before = toApiVenue(current);
    const after = toApiVenue(updated);
    await tx.venueHistory.create({
      data: {
        venueId: idValue, actorId: actor.id, actorRole: actor.role,
        action: 'VENUE_UPDATED', reason: input.reason || 'Venue updated',
        changes: safeJson({ before, after }),
      },
    });
    await enqueueRecheck(after,actor,input.reason || 'Venue updated',tx);
    return after;
  });
}

function setOperatingHours(venueId, hours, actor, reason, version) {
  if (isMemory) {
    const venue = state.venues.get(venueId);
    if (!venue) return null;
    checkVersion(venue,version);
    const before = venue.operatingHours;
    venue.operatingHours = hours.map((hour) => ({ ...hour, id: hour.id || id(), venueId }));
    venue.updatedAt = now();
    venue.version=(venue.version ?? 1)+1;
    recordHistory(venueId, actor, 'OPERATING_HOURS_UPDATED', reason, { before, after: venue.operatingHours });
    enqueueRecheck(venue,actor,reason);
    return venue.operatingHours;
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM venues WHERE id = ${venueId} FOR UPDATE`;
    const venue = await tx.venue.findUnique({ where: { id: venueId }, include: { operatingHours: true } });
    if (!venue) return null;
    checkVersion(venue,version);
    const before = toApiHours(venue.operatingHours);
    await tx.venueOperatingHour.deleteMany({ where: { venueId } });
    await tx.venueOperatingHour.createMany({
      data: hours.map((hour) => ({
        id: hour.id || id(), venueId, weekday: hour.weekday, isClosed: Boolean(hour.isClosed),
        opensAt: hour.opensAt || null, closesAt: hour.closesAt || null,
      })),
    });
    const updated = await tx.venue.update({ where: { id: venueId }, data: { version:{increment:1} }, include: { operatingHours: true } });
    const after = toApiHours(updated.operatingHours);
    await tx.venueHistory.create({
      data: {
        venueId, actorId: actor.id, actorRole: actor.role, action: 'OPERATING_HOURS_UPDATED', reason,
        changes: safeJson({ before, after }),
      },
    });
    await enqueueRecheck(toApiVenue(updated),actor,reason,tx);
    return after;
  });
}

function checkVersion(current,version) {
  if (version!==undefined && current.version!==version) throw Object.assign(new Error('Venue changed. Reload before saving.'),{status:409,code:'STALE_VENUE'});
}
function enqueueRecheck(venue,actor,reason,transaction) {
  const payload={venueId:venue.id,version:venue.version,actor:{id:actor.id,role:actor.role},reason};
  if (isMemory) { const row={id:id(),venueId:venue.id,version:venue.version,payload,attempts:0,lastError:null,createdAt:now(),deliveredAt:null};state.outbox.push(row);return row; }
  return transaction.venueRecheckOutbox.create({data:{venueId:venue.id,version:venue.version,payload:safeJson(payload)}});
}
function pendingRechecks() {
  if (isMemory) return state.outbox.filter(row=>!row.deliveredAt).slice(0,20);
  return prisma.venueRecheckOutbox.findMany({where:{deliveredAt:null},orderBy:{createdAt:'asc'},take:20});
}
function finishRecheck(idValue,error) {
  const data={attempts:{increment:1},lastError:error?String(error.message).slice(0,160):null,...(!error?{deliveredAt:new Date()}: {})};
  if (isMemory) { const row=state.outbox.find(row=>row.id===idValue);if(row && !row.deliveredAt){row.attempts++;row.lastError=data.lastError;if(!error)row.deliveredAt=now();}return; }
  return prisma.venueRecheckOutbox.updateMany({where:{id:idValue,deliveredAt:null},data});
}

function listHistory(venueId) {
  if (isMemory) {
    return state.history
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.venueId === venueId)
      .sort((a, b) => b.entry.occurredAt.localeCompare(a.entry.occurredAt) || b.index - a.index)
      .map(({ entry }) => entry);
  }
  return prisma.venueHistory.findMany({ where: { venueId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] })
    .then((items) => items.map(toApiHistory));
}

function getVenue(idValue) {
  if (isMemory) return state.venues.get(idValue) || null;
  return prisma.venue.findUnique({ where: { id: idValue }, include: { operatingHours: true } }).then(toApiVenue);
}

function listVenues() {
  if (isMemory) return [...state.venues.values()];
  return prisma.venue.findMany({ include: { operatingHours: true }, orderBy: { createdAt: 'asc' } })
    .then((items) => items.map(toApiVenue));
}

function deleteVenue(idValue) {
  if (isMemory) {
    if (!state.venues.has(idValue)) return false;
    state.venues.delete(idValue);
    state.history = state.history.filter((entry) => entry.venueId !== idValue);
    state.outbox = state.outbox.filter(row=>row.venueId!==idValue);
    return true;
  }
  return prisma.venue.delete({ where: { id: idValue } }).then(() => true).catch((error) => {
    if (error?.code === 'P2025') return false;
    throw error;
  });
}

module.exports = {
  state, reset, createVenue, replaceVenue, setOperatingHours, listHistory,
  getVenue, listVenues, deleteVenue, isMemory,
  pendingRechecks,finishRecheck,
};
