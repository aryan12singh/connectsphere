const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { venues: new Map(), history: [] };

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
    const updated = {
      ...current, name: input.name, address: input.address, capacity: input.capacity,
      venueType: input.venueType, supportedLayouts: [...input.supportedLayouts],
      facilities: [...input.facilities], accessibilityTags: [...input.accessibilityTags],
      timeZone: input.timeZone, isActive: input.isActive, managedById: input.managedById, updatedAt: now(),
      operatingHours: input.operatingHours.map((hour) => ({ ...hour, id: hour.id || id(), venueId: idValue })),
    };
    state.venues.set(idValue, updated);
    recordHistory(idValue, actor, 'VENUE_UPDATED', input.reason || 'Venue updated', { before: current, after: updated });
    return updated;
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.venue.findUnique({ where: { id: idValue }, include: { operatingHours: true } });
    if (!current) return null;
    await tx.venue.update({
      where: { id: idValue },
      data: {
        name: input.name, address: input.address, capacity: input.capacity,
        venueType: input.venueType, supportedLayouts: input.supportedLayouts,
        facilities: input.facilities, accessibilityTags: input.accessibilityTags,
        timeZone: input.timeZone, isActive: input.isActive, managedById: input.managedById,
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
    return after;
  });
}

function setOperatingHours(venueId, hours, actor, reason) {
  if (isMemory) {
    const venue = state.venues.get(venueId);
    if (!venue) return null;
    const before = venue.operatingHours;
    venue.operatingHours = hours.map((hour) => ({ ...hour, id: hour.id || id(), venueId }));
    venue.updatedAt = now();
    recordHistory(venueId, actor, 'OPERATING_HOURS_UPDATED', reason, { before, after: venue.operatingHours });
    return venue.operatingHours;
  }
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.findUnique({ where: { id: venueId }, include: { operatingHours: true } });
    if (!venue) return null;
    const before = toApiHours(venue.operatingHours);
    await tx.venueOperatingHour.deleteMany({ where: { venueId } });
    await tx.venueOperatingHour.createMany({
      data: hours.map((hour) => ({
        id: hour.id || id(), venueId, weekday: hour.weekday, isClosed: Boolean(hour.isClosed),
        opensAt: hour.opensAt || null, closesAt: hour.closesAt || null,
      })),
    });
    const updated = await tx.venue.update({ where: { id: venueId }, data: { name: venue.name }, include: { operatingHours: true } });
    const after = toApiHours(updated.operatingHours);
    await tx.venueHistory.create({
      data: {
        venueId, actorId: actor.id, actorRole: actor.role, action: 'OPERATING_HOURS_UPDATED', reason,
        changes: safeJson({ before, after }),
      },
    });
    return after;
  });
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

module.exports = {
  state, reset, createVenue, replaceVenue, setOperatingHours, listHistory,
  getVenue, listVenues, isMemory,
};
