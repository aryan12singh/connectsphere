const { createHash } = require('node:crypto');
const config = require('./config');
const prisma = require('./db');
const store = require('./store');
const eventContexts = require('./eventContext');

const memoryFences = new Map();
const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const json = value => JSON.parse(JSON.stringify(value));

async function lock(tx, eventRequestId) {
  // Callers use ReadCommitted so a fence committed while this waits is visible
  // to the invalidation query after the request lock has been acquired.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'technical:' + eventRequestId},0))::text`;
}

async function lockStock(tx, types) {
  // Preparation and supply mutations share these locks: either a mutation is
  // reflected in the proof, or it sees the committed fence and invalidates it.
  for (const type of [...new Set(types)].sort()) {
    await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${type} FOR UPDATE`;
  }
}

async function current(eventId, db = prisma, context = null) {
  const requests = config.dataMode === 'prisma' ? await db.technicalRequest.findMany({ where: { OR: [{ planningEventId: eventId }, { eventRequestId: eventId }] } }) : await store.listRequests();
  const request = requests.filter(row => (row.planningEventId || row.eventRequestId) === eventId).sort((a, b) => b.version - a.version)[0];
  const base = { eventId, status: 'UNVERIFIED', equipment: [] };
  if (!request) return { ...base, reason: 'TECHNICAL_REQUEST_MISSING' };
  context ||= await eventContexts.eventContext(eventId);
  if (request.planningEventId !== eventId || request.requirementsRevision !== context.requirementsRevision || context.eventRequestId !== request.eventRequestId) {
    return { ...base, reason: 'TECHNICAL_REQUIREMENTS_STALE' };
  }
  const requirements = request.requirements;
  const evidence = {
    ...base, eventRequestId: request.eventRequestId, technicalRequestId: request.id || request.eventRequestId,
    version: request.version, requirementsRevision: request.requirementsRevision,
    approvedById: request.decidedById, approvedAt: request.decidedAt,
    equipment: requirements.equipment.map(line => ({ ...line, label: line.equipmentType })),
    placementDetails: requirements.placementDetails || '',
    supportRequired: requirements.supportRequired, supportDetails: requirements.supportDetails || '',
  };
  const ready = value => ({ ...value, fingerprint: createHash('sha256').update(JSON.stringify(value)).digest('hex') });
  if (request.status === 'NOT_REQUIRED') return ready({ ...evidence, status: 'NOT_REQUIRED', reservations: [] });
  if (request.status !== 'APPROVED') return { ...evidence, status: 'PENDING', reason: 'TECHNICAL_APPROVAL_REQUIRED' };
  const active = config.dataMode === 'prisma'
    ? await db.equipmentReservation.findMany({ where: { eventRequestId: request.eventRequestId, active: true }, orderBy: { equipmentType: 'asc' } })
    : require('./operations')._memory.reservations.filter(row => row.eventRequestId === request.eventRequestId && row.active);
  const complete = active.length === requirements.equipment.length && requirements.equipment.every(line => active.some(row => row.eventId === eventId && row.requestVersion === request.version && row.equipmentType === line.equipmentType && row.quantity === line.quantity));
  if (!complete) return { ...evidence, status: 'PENDING', reason: 'RESERVATION_PROOF_MISSING' };
  if (active.length) {
    const window = { startAt: new Date(Math.min(...active.map(row => Date.parse(row.startAt)))).toISOString(), endAt: new Date(Math.max(...active.map(row => Date.parse(row.endAt)))).toISOString() };
    const supply = await require('./operations').availability({ request, window, excludeEventRequestId: request.eventRequestId, db });
    if (!supply.fulfillable) return { ...evidence, status: 'PENDING', reason: 'EQUIPMENT_OPERATION_CHANGED', affectedReservationIds: active.map(row => row.id) };
  }
  return ready({ ...evidence, status: 'APPROVED', reservations: active });
}

async function prepare(eventId, input) {
  if (typeof input?.token !== 'string' || !input.token || !Number.isSafeInteger(input.generation) || input.generation < 1) throw error(422, 'VALIDATION_FAILED', 'Safety token and generation are required.');
  const first = await eventContexts.eventContext(eventId);
  const prepareProof = async db => {
    if (db) await lock(db, first.eventRequestId);
    const context = await eventContexts.eventContext(eventId);
    if (context.safetyToken !== input.token || context.safetyGeneration !== input.generation || context.safetyState !== 'PREPARING') throw error(409, 'SAFETY_SUPERSEDED', 'The Safety operation changed.');
    if (db) {
      const request = await db.technicalRequest.findUnique({ where: { eventRequestId: context.eventRequestId } });
      await lockStock(db, (request?.requirements.equipment || []).map(line => line.equipmentType));
    }
    const proof = await current(eventId, db, context);
    if (!['APPROVED', 'NOT_REQUIRED'].includes(proof.status)) throw error(409, 'TECHNICAL_NOT_READY', 'Current technical proof is required.');
    const existing = db ? await db.technicalReadinessFence.findUnique({ where: { token: input.token } }) : memoryFences.get(input.token);
    if (existing && (!existing.active || existing.eventId !== eventId || existing.proof.fingerprint !== proof.fingerprint)) throw error(409, 'TECHNICAL_REQUIREMENTS_STALE', 'Technical proof changed after preparation.');
    if (db) {
      await db.technicalReadinessFence.updateMany({ where: { eventId, active: true, NOT: { token: input.token } }, data: { active: false } });
      await db.technicalReadinessFence.upsert({ where: { token: input.token }, create: { token: input.token, eventId, eventRequestId: proof.eventRequestId, proof: json(proof) }, update: {} });
    }
    else {
      for (const [token, fence] of memoryFences) if (fence.eventId === eventId && token !== input.token) fence.active = false;
      if (!existing) memoryFences.set(input.token, { eventId, eventRequestId: proof.eventRequestId, proof: json(proof), active: true });
    }
    return proof;
  };
  return config.dataMode === 'prisma' ? prisma.$transaction(prepareProof, { timeout: 15000, maxWait: 5000 }) : prepareProof(null);
}

async function invalidateRequest(eventRequestId, db = null) {
  const fences = db ? await db.technicalReadinessFence.findMany({ where: { eventRequestId, active: true } }) : [...memoryFences].filter(([, row]) => row.eventRequestId === eventRequestId && row.active).map(([token, row]) => ({ token, ...row }));
  for (const fence of fences) {
    let response, ack;
    try {
      response = await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(fence.eventId)}/readiness-invalidations`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-api-key': config.internalApiKey }, body: JSON.stringify({ token: fence.token, reason: 'Technical arrangements changed' }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Invalidation failed');
      ack = await response.json();
    }
    catch { throw error(503, 'SAFETY_FENCE_UNAVAILABLE', 'Unable to invalidate the current Safety proof.'); }
    if (!Object.hasOwn(ack, 'currentToken') || ack.currentToken === fence.token) throw error(409, 'SAFETY_FENCE_CHANGED', 'Refresh the current Safety review before changing technical arrangements.');
    if (db) await db.technicalReadinessFence.update({ where: { token: fence.token }, data: { active: false } });
    else memoryFences.get(fence.token).active = false;
  }
}

async function release(eventId, token) {
  if (!token) return { eventId, released: false };
  if (config.dataMode === 'prisma') return prisma.$transaction(async tx => {
    const fence = await tx.technicalReadinessFence.findUnique({ where: { token } });
    if (!fence || fence.eventId !== eventId) return { eventId, released: false };
    await lock(tx, fence.eventRequestId);
    const updated = await tx.technicalReadinessFence.updateMany({ where: { token, eventId, active: true }, data: { active: false } });
    return { eventId, released: updated.count === 1 };
  });
  const fence = memoryFences.get(token);
  if (!fence || fence.eventId !== eventId || !fence.active) return { eventId, released: false };
  fence.active = false;
  return { eventId, released: true };
}

module.exports = { current, prepare, release, lock, lockStock, invalidateRequest };
