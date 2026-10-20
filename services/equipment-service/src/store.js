const config = require('./config');
const prisma = require('./db');

const memory = { requests: new Map(), history: new Map(), outbox: new Map(), idempotency: new Map() };

function requestView(request) {
  return {
    eventRequestId: request.eventRequestId,
    coordinatorId: request.coordinatorId,
    version: request.version,
    status: request.status,
    equipment: Array.isArray(request.requirements?.equipment) ? request.requirements.equipment.map(line => ({ equipmentType: line.equipmentType, quantity: line.quantity, venueId: line?.venueId || null })) : request.requirements.equipment,
    supportRequired: request.requirements.supportRequired,
    supportDetails: request.requirements.supportDetails,
    placementDetails: request.requirements.placementDetails,
    notRequired: request.requirements.notRequired,
    decisionReason: request.decisionReason || null,
    decidedById: request.decidedById || null,
    decidedAt: request.decidedAt || null,
    updatedAt: request.updatedAt || null,
  };
}

async function listEquipmentTypes() {
  const inventory = await require('./inventory').inventory();
  return inventory.items.map(item => ({
    id: `eq_${item.equipmentType}`,
    name: item.equipmentType,
    total: item.total,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

async function findRequest(eventRequestId) {
  if (config.dataMode !== 'prisma') return memory.requests.get(eventRequestId) || null;
  return prisma.technicalRequest.findUnique({ where: { eventRequestId } });
}

async function listRequests() {
  if (config.dataMode !== 'prisma') return [...memory.requests.values()];
  return prisma.technicalRequest.findMany({ orderBy: { updatedAt: 'desc' } });
}

async function findIdempotency(actorId, key) {
  if (!key) return null;
  if (config.dataMode !== 'prisma') return memory.idempotency.get(`${actorId}:${key}`) || null;
  return prisma.idempotencyRecord.findUnique({ where: { actorId_key: { actorId, key } } });
}

function requestHash(body) { return JSON.stringify(body); }

async function saveSubmission({ eventRequestId, actor, value, key, hash, context = null }) {
  const now = new Date().toISOString();
  if (config.dataMode !== 'prisma') {
    const existing = memory.requests.get(eventRequestId);
    if (existing && value.version !== existing.version + 1) return { conflict: true };
    if (!existing && value.version !== 1) return { conflict: true };
    const record = {
      eventRequestId, planningEventId: context?.eventId || null, requirementsRevision: context?.requirementsRevision || null, coordinatorId: actor.id, version: value.version,
      status: value.status, requirements: value.requirements,
      decisionReason: null, decidedById: value.status === 'NOT_REQUIRED' ? actor.id : null,
      decidedAt: value.status === 'NOT_REQUIRED' ? now : null, updatedAt: now,
    };
    memory.requests.set(eventRequestId, record);
    const eventType = value.status === 'NOT_REQUIRED' ? 'TechRequestDeclaredNotRequired' : 'TechRequestSubmitted';
    const actionKey = `${eventType}:${eventRequestId}:v${value.version}`;
    memory.history.set(actionKey, { action: eventType, actorId: actor.id, version: value.version, createdAt: now });
    memory.outbox.set(actionKey, { actionKey, eventType, payload: requestView(record), createdAt: now });
    const result = requestView(record);
    if (key) memory.idempotency.set(`${actor.id}:${key}`, { requestHash: hash, responseBody: result });
    return { record, result };
  }
  try {
    return await prisma.$transaction(async tx => {
      const current = await tx.technicalRequest.findUnique({ where: { eventRequestId } });
      if (current && value.version !== current.version + 1) return { conflict: true };
      if (!current && value.version !== 1) return { conflict: true };
      const record = current
        ? await tx.technicalRequest.update({
            where: { id: current.id, version: current.version },
            data: { planningEventId: context?.eventId || current.planningEventId, requirementsRevision: context?.requirementsRevision || current.requirementsRevision, coordinatorId: actor.id, version: value.version, status: value.status, requirements: value.requirements, decisionReason: null, decidedById: value.status === 'NOT_REQUIRED' ? actor.id : null, decidedAt: value.status === 'NOT_REQUIRED' ? new Date(now) : null },
          })
        : await tx.technicalRequest.create({ data: { eventRequestId, planningEventId: context?.eventId || null, requirementsRevision: context?.requirementsRevision || null, coordinatorId: actor.id, version: value.version, status: value.status, requirements: value.requirements, decidedById: value.status === 'NOT_REQUIRED' ? actor.id : null, decidedAt: value.status === 'NOT_REQUIRED' ? new Date(now) : null } });
      const eventType = value.status === 'NOT_REQUIRED' ? 'TechRequestDeclaredNotRequired' : 'TechRequestSubmitted';
      const actionKey = `${eventType}:${eventRequestId}:v${value.version}`;
      await tx.technicalRequestHistory.create({ data: { requestId: record.id, version: value.version, action: eventType, actorId: actor.id, actorRole: actor.role } });
      await tx.outboxEvent.create({ data: { actionKey, eventType, payload: requestView(record) } });
      const result = requestView(record);
      if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: result } });
      return { record, result };
    }, { isolationLevel: 'Serializable' });
  }
  catch (error) {
    if (error.code === 'P2002' || error.code === 'P2034') return { conflict: true };
    throw error;
  }
}

async function saveDecision({ eventRequestId, actor, decision, reason, version, key, hash }) {
  const now = new Date().toISOString();
  if (config.dataMode !== 'prisma') {
    const current = memory.requests.get(eventRequestId);
    if (!current || current.version !== version || current.status !== 'PENDING_TECH_REVIEW' && current.status !== 'SUBMITTED') return { conflict: true };
    const next = { ...current, status: decision, decisionReason: decision === 'REJECTED' ? reason : null, decidedById: actor.id, decidedAt: now, updatedAt: now };
    memory.requests.set(eventRequestId, next);
    const actionKey = `TechRequestDecided:${eventRequestId}:v${version}`;
    memory.history.set(actionKey, { action: 'TechRequestDecided', actorId: actor.id, version, details: { decision, reason }, createdAt: now });
    memory.outbox.set(actionKey, { actionKey, eventType: 'TechRequestDecided', payload: requestView(next), createdAt: now });
    const result = requestView(next);
    if (key) memory.idempotency.set(`${actor.id}:${key}`, { requestHash: hash, responseBody: result });
    return { result };
  }
  try {
    return await prisma.$transaction(async tx => {
      const current = await tx.technicalRequest.findUnique({ where: { eventRequestId } });
      if (!current || current.version !== version || current.status !== 'PENDING_TECH_REVIEW' && current.status !== 'SUBMITTED') return { conflict: true };
      const changed = await tx.technicalRequest.updateMany({
        where: { id: current.id, version, status: current.status },
        data: { status: decision, decisionReason: decision === 'REJECTED' ? reason : null, decidedById: actor.id, decidedAt: new Date(now) },
      });
      if (changed.count !== 1) return { conflict: true };
      const record = await tx.technicalRequest.findUnique({ where: { id: current.id } });
      const actionKey = `TechRequestDecided:${eventRequestId}:v${version}`;
      await tx.technicalRequestHistory.create({ data: { requestId: current.id, version, action: 'TechRequestDecided', actorId: actor.id, actorRole: actor.role, details: { decision, reason: decision === 'REJECTED' ? reason : null } } });
      await tx.outboxEvent.create({ data: { actionKey, eventType: 'TechRequestDecided', payload: requestView(record) } });
      const result = requestView(record);
      if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: result } });
      return { result };
    }, { isolationLevel: 'Serializable' });
  }
  catch (error) {
    if (error.code === 'P2002' || error.code === 'P2034') return { conflict: true };
    throw error;
  }
}

module.exports = { listEquipmentTypes, findRequest, listRequests, findIdempotency, requestHash, saveSubmission, saveDecision, requestView };
