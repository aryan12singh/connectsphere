const crypto = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode !== 'prisma';
const prisma = isMemory ? null : require('./db');

const state = { venues: new Map(), history: [], outbox: [], rollouts: [] };

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
    buffersLockedAt: iso(venue.buffersLockedAt) ?? null,
    legacyBufferConfigurationPending:venue.legacyBufferConfigurationPending===true,
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
    state.rollouts.length = 0;
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
    // A new random Venue ID has no inherited commitments. Record that fact in
    // the same creation operation, so its next edit has only one recheck action.
    state.rollouts.push({...rolloutData(venue),attempts:0,lastError:null,createdAt:timestamp,completedAt:timestamp,completionReason:'NEW_VENUE_NO_INHERITED_COMMITMENTS'});
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
    await tx.venueBufferRollout.create({data:{...rolloutData(apiVenue),completedAt:new Date(),completionReason:'NEW_VENUE_NO_INHERITED_COMMITMENTS'}});
    return apiVenue;
  });
}

function checkBufferLock(current,input) {
  if(current.buffersLockedAt && ((input.setupMinutes ?? current.setupMinutes)!==current.setupMinutes || (input.turnaroundMinutes ?? current.turnaroundMinutes)!==current.turnaroundMinutes))throw Object.assign(new Error('Setup and turnaround are locked for this venue. Other venue details can still be maintained.'),{status:409,code:'VENUE_BUFFERS_LOCKED'});
}

// This monotonic fence is established before Booking can persist CONFIRMED.
// An uncertain cross-service failure must never automatically unlock buffers.
async function lockBuffers(idValue,version,actor) {
  async function locked(current,tx) {
    if(!current)return null;
    checkVersion(current,version);
    if(current.buffersLockedAt)return toApiVenue(current);
    const stamp=new Date(),changes={buffersLockedAt:stamp.toISOString()};
    if(!tx){const saved={...current,buffersLockedAt:stamp.toISOString(),version:current.version+1,updatedAt:stamp.toISOString()};state.venues.set(idValue,saved);recordHistory(idValue,actor,'VENUE_BUFFERS_LOCKED','Fence venue buffers before booking confirmation',changes);return saved;}
    const saved=await tx.venue.update({where:{id:idValue},data:{buffersLockedAt:stamp,version:{increment:1}},include:{operatingHours:true}});
    await tx.venueHistory.create({data:{venueId:idValue,actorId:actor.id,actorRole:actor.role,action:'VENUE_BUFFERS_LOCKED',reason:'Fence venue buffers before booking confirmation',changes}});
    return toApiVenue(saved);
  }
  if(isMemory)return locked(state.venues.get(idValue),null);
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM venues WHERE id=${idValue} FOR UPDATE`;return locked(await tx.venue.findUnique({where:{id:idValue},include:{operatingHours:true}}),tx);});
}

async function configureLegacyBuffers(idValue,input,actor){
  async function save(current,tx){
    if(!current)return null;
    checkVersion(current,input.version);
    if(!current.legacyBufferConfigurationPending)throw Object.assign(new Error('Initial coordinated configuration is no longer available'),{status:409,code:'LEGACY_CONFIGURATION_CLOSED'});
    const stamp=new Date(),data={setupMinutes:input.setupMinutes,turnaroundMinutes:input.turnaroundMinutes,legacyBufferConfigurationPending:false,buffersLockedAt:input.retainLock?current.buffersLockedAt || stamp:null};
    const changes={before:{setupMinutes:current.setupMinutes,turnaroundMinutes:current.turnaroundMinutes},after:{setupMinutes:input.setupMinutes,turnaroundMinutes:input.turnaroundMinutes},communications:input.communications,configuredAfterConfirmation:input.retainLock};
    if(!tx){const saved={...current,...data,buffersLockedAt:iso(data.buffersLockedAt),version:current.version+1,updatedAt:stamp.toISOString()};state.venues.set(idValue,saved);recordHistory(idValue,actor,'LEGACY_BUFFERS_CONFIGURED',input.reason,changes);enqueueRecheck(saved,actor,input.reason);return saved;}
    const saved=await tx.venue.update({where:{id:idValue},data:{...data,version:{increment:1}},include:{operatingHours:true}});
    await tx.venueHistory.create({data:{venueId:idValue,actorId:actor.id,actorRole:actor.role,action:'LEGACY_BUFFERS_CONFIGURED',reason:input.reason,changes:safeJson(changes)}});
    await enqueueRecheck(toApiVenue(saved),actor,input.reason,tx);
    return toApiVenue(saved);
  }
  if(isMemory)return save(state.venues.get(idValue),null);
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM venues WHERE id=${idValue} FOR UPDATE`;return save(await tx.venue.findUnique({where:{id:idValue},include:{operatingHours:true}}),tx);});
}

function recoverableFence(current,history){return Boolean(current.buffersLockedAt && !current.legacyBufferConfigurationPending && history.some(h=>h.action==='VENUE_BUFFERS_LOCKED') && !history.some(h=>h.action==='LEGACY_BUFFERS_CONFIGURED' && h.changes?.configuredAfterConfirmation!==false));}
function replaceVenue(idValue, input, actor,options={}) {
  if (isMemory) {
    const current = state.venues.get(idValue);
    if (!current) return null;
    checkVersion(current,input.version);
    const recover=options.recoverFence && recoverableFence(current,state.history.filter(row=>row.venueId===idValue));
    if(options.recoverFence && !recover)throw Object.assign(new Error('This venue does not have an uncommitted confirmation fence'),{status:409,code:'VENUE_BUFFERS_LOCKED'});
    if(!recover)checkBufferLock(current,input);
    const updated = {
      ...current, name: input.name, address: input.address, capacity: input.capacity,
      venueType: input.venueType, supportedLayouts: [...input.supportedLayouts],
      facilities: [...input.facilities], accessibilityTags: [...input.accessibilityTags],
      timeZone: input.timeZone, isActive: input.isActive, managedById: input.managedById, updatedAt: now(),
      setupMinutes: input.setupMinutes ?? current.setupMinutes ?? 0,
      turnaroundMinutes: input.turnaroundMinutes ?? current.turnaroundMinutes ?? 0,
      version: (current.version ?? 1) + 1,
      ...(recover?{buffersLockedAt:null}:{}),
      operatingHours: input.operatingHours.map((hour) => ({ ...hour, id: hour.id || id(), venueId: idValue })),
    };
    state.venues.set(idValue, updated);
    recordHistory(idValue, actor, recover?'BUFFER_FENCE_RECOVERED':'VENUE_UPDATED', input.reason || 'Venue updated', { before: current, after: updated });
    enqueueRecheck(updated,actor,input.reason || 'Venue updated');
    return updated;
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM venues WHERE id = ${idValue} FOR UPDATE`;
    const current = await tx.venue.findUnique({ where: { id: idValue }, include: { operatingHours: true } });
    if (!current) return null;
    checkVersion(current,input.version);
    const recover=options.recoverFence && recoverableFence(current,await tx.venueHistory.findMany({where:{venueId:idValue},select:{action:true,changes:true}}));
    if(options.recoverFence && !recover)throw Object.assign(new Error('This venue does not have an uncommitted confirmation fence'),{status:409,code:'VENUE_BUFFERS_LOCKED'});
    if(!recover)checkBufferLock(current,input);
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
        ...(recover?{buffersLockedAt:null}:{}),
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
        action: recover?'BUFFER_FENCE_RECOVERED':'VENUE_UPDATED', reason: input.reason || 'Venue updated',
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
function rolloutData(venue) {
  return {
    id:id(),venueId:venue.id,version:venue.version,
    payload:{venueId:venue.id,version:venue.version,actor:{id:'venue-buffer-rollout',role:'SYSTEM'},reason:'Initial venue buffer rollout'},
  };
}
async function enqueueInitialBufferRechecks() {
  if (isMemory) {
    for(const venue of state.venues.values()) {
      if(state.rollouts.some(row=>row.venueId===venue.id))continue;
      state.rollouts.push({...rolloutData(venue),attempts:0,lastError:null,createdAt:now(),completedAt:null,completionReason:null});
    }
    return;
  }
  // Lock only a bounded batch of not-yet-evaluated venues. Concurrent startups
  // skip another instance's rows; subsequent polls collect any deferred rows.
  await prisma.$transaction(async tx=>{
    const venues=await tx.$queryRaw`
      SELECT v.id,v.version FROM venues v
      WHERE NOT EXISTS (SELECT 1 FROM venue_buffer_rollouts r WHERE r."venueId"=v.id)
      ORDER BY v.id LIMIT 100 FOR UPDATE OF v SKIP LOCKED`;
    if(venues.length)await tx.venueBufferRollout.createMany({data:venues.map(rolloutData),skipDuplicates:true});
  });
}
async function pendingRechecks() {
  const order=(a,b)=>a.attempts-b.attempts || new Date(a.createdAt)-new Date(b.createdAt) || a.id.localeCompare(b.id);
  if (isMemory) return [...state.outbox.map(row=>({...row,queue:'configuration'})),...state.rollouts.map(row=>({...row,deliveredAt:row.completedAt,queue:'rollout'}))].filter(row=>!row.deliveredAt).sort(order).slice(0,20);
  const query={where:{deliveredAt:null},orderBy:[{attempts:'asc'},{createdAt:'asc'},{id:'asc'}],take:20};
  const [configuration,rollout]=await Promise.all([prisma.venueRecheckOutbox.findMany(query),prisma.venueBufferRollout.findMany({...query,where:{completedAt:null}})]);
  return [...configuration.map(row=>({...row,queue:'configuration'})),...rollout.map(row=>({...row,deliveredAt:row.completedAt,queue:'rollout'}))].sort(order).slice(0,20);
}
function finishRecheck(idValue,error,queue='configuration') {
  const data={attempts:{increment:1},lastError:error?String(error.message).slice(0,160):null,...(!error?{deliveredAt:new Date()}: {})};
  const completed=queue==='rollout'?'completedAt':'deliveredAt';
  if (isMemory) { const row=(queue==='rollout'?state.rollouts:state.outbox).find(row=>row.id===idValue);if(row && !row[completed]){row.attempts++;row.lastError=data.lastError;if(!error){row[completed]=now();if(queue==='rollout')row.completionReason='BOOKING_ACKNOWLEDGED';}}return; }
  if(queue==='rollout')return prisma.venueBufferRollout.updateMany({where:{id:idValue,completedAt:null},data:{attempts:data.attempts,lastError:data.lastError,...(!error?{completedAt:new Date(),completionReason:'BOOKING_ACKNOWLEDGED'}:{})}});
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

function deleteVenue(idValue,version) {
  if (isMemory) {
    if (!state.venues.has(idValue)) return false;
    checkVersion(state.venues.get(idValue),version);
    state.venues.delete(idValue);
    state.history = state.history.filter((entry) => entry.venueId !== idValue);
    state.outbox = state.outbox.filter(row=>row.venueId!==idValue);
    state.rollouts = state.rollouts.filter(row=>row.venueId!==idValue);
    return true;
  }
  return prisma.$transaction(async tx=>{
    const [current]=await tx.$queryRaw`SELECT version FROM venues WHERE id=${idValue} FOR UPDATE`;
    if(!current)return false;
    checkVersion(current,version);
    await tx.venue.delete({where:{id:idValue}});
    return true;
  });
}

module.exports = {
  state, reset, createVenue, replaceVenue, lockBuffers, configureLegacyBuffers,recoverableFence, setOperatingHours, listHistory,
  getVenue, listVenues, deleteVenue, isMemory,
  enqueueInitialBufferRechecks,pendingRechecks,finishRecheck,
};
