const config = require('./config');
const prisma = require('./db');

const memory = { types: new Map(), requests: new Map(), history: new Map(), outbox: new Map(), idempotency: new Map() };
for (const name of ['projector', 'microphone', 'speaker', 'lighting', 'stage']) memory.types.set(name, { id: `eq_${name}`, name });

function requestView(request) {
  return {
    eventRequestId: request.eventRequestId,
    planningEventId:request.planningEventId||null,
    requirementsRevision:request.requirementsRevision||null,
    coordinatorId: request.coordinatorId,
    coverageResolution:request.coverageResolution||null,
    version: request.version,
    status: request.status,
    equipment: request.requirements.equipment,
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
  if (config.dataMode !== 'prisma') return [...memory.types.values()];
  return prisma.equipmentType.findMany({ orderBy: { name: 'asc' } });
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

async function saveSubmission({ eventRequestId, actor, value, key, hash }) {
  const now = new Date().toISOString();
  if (config.dataMode !== 'prisma') {
    const existing = memory.requests.get(eventRequestId);
    if(existing&&value.version===existing.version&&JSON.stringify(existing.requirements)===JSON.stringify(value.requirements))return {record:existing,result:requestView(existing)};
    if (existing && value.version !== existing.version + 1) return { conflict: true };
    if (!existing && value.version !== 1) return { conflict: true };
    const record = {
      eventRequestId, coordinatorId: actor.id, version: value.version,
      status: 'SUBMITTED', requirements: value.requirements,
      decisionReason: null, decidedById: null, decidedAt: null, updatedAt: now,
    };
    memory.requests.set(eventRequestId, record);
    const actionKey = `TechRequestSubmitted:${eventRequestId}:v${value.version}`;
    memory.history.set(actionKey, { action: 'TechRequestSubmitted', actorId: actor.id, version: value.version, createdAt: now });
    memory.outbox.set(actionKey, { actionKey, eventType: 'TechRequestSubmitted', payload: requestView(record), createdAt: now });
    const result = requestView(record);
    if (key) memory.idempotency.set(`${actor.id}:${key}`, { requestHash: hash, responseBody: result });
    return { record, result };
  }
  try {
    return await prisma.$transaction(async tx => {
      await require('./readiness').lock(tx,eventRequestId);
      const current = await tx.technicalRequest.findUnique({ where: { eventRequestId } });
      if(!config.isTest){
       const source=await require('./eventContext').requestContext(eventRequestId);
       if(source.currentCoordinatorId!==actor.id)throw Object.assign(new Error('Only the current Coordinator may submit'),{status:403,code:'FORBIDDEN'});
       if(source.eventId!==value.planningEventId||source.requirementsRevision!==value.requirementsRevision||source.status!=='ARRANGEMENT_PENDING'||['PREPARING','PENDING','APPROVED'].includes(source.safetyState))return {conflict:true};
      }
      if(key){const cached=await tx.idempotencyRecord.findUnique({where:{actorId_key:{actorId:actor.id,key}}});if(cached){if(cached.requestHash!==hash)throw Object.assign(new Error('Action key used with different data'),{status:409,code:'IDEMPOTENCY_CONFLICT'});return {result:cached.responseBody};}}
      if(current&&value.version===current.version&&JSON.stringify(current.requirements)===JSON.stringify(value.requirements)&&current.coordinatorId===actor.id&&current.requirementsRevision===(value.requirementsRevision??null)){const result=requestView(current);if(key)await tx.idempotencyRecord.create({data:{actorId:actor.id,key,requestHash:hash,responseBody:result}});return {record:current,result};}
      if (current && value.version !== current.version + 1) return { conflict: true };
      if (!current && value.version !== 1) return { conflict: true };
      await require('./readiness').invalidateRequest(eventRequestId,tx);
      const record = current
        ? await tx.technicalRequest.update({
            where: { id: current.id, version: current.version },
            data: { planningEventId:value.planningEventId||null,requirementsRevision:value.requirementsRevision||null,coordinatorId: actor.id, version: value.version, status: 'SUBMITTED', requirements: value.requirements, coverageResolution:require('@prisma/client').Prisma.DbNull, decisionReason: null, decidedById: null, decidedAt: null },
          })
        : await tx.technicalRequest.create({ data: { eventRequestId,planningEventId:value.planningEventId||null,requirementsRevision:value.requirementsRevision||null,coordinatorId: actor.id, version: value.version, status: 'SUBMITTED', requirements: value.requirements } });
      const actionKey = `TechRequestSubmitted:${eventRequestId}:v${value.version}`;
      await tx.technicalRequestHistory.create({ data: { requestId: record.id, version: value.version, action: 'TechRequestSubmitted', actorId: actor.id, actorRole: actor.role } });
      await tx.outboxEvent.create({ data: { actionKey, eventType: 'TechRequestSubmitted', payload: requestView(record) } });
      const result = requestView(record);
      if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: result } });
      return { record, result };
    }, {isolationLevel:'ReadCommitted',timeout:15000,maxWait:10000});
  }
  catch (error) {
    if (error.code === 'P2002' || error.code === 'P2034') return { conflict: true };
    throw error;
  }
}

async function saveDecision({ eventRequestId, actor, decision, reason, version, coverageResolution, key, hash }) {
  const now = new Date().toISOString();
  if (config.dataMode !== 'prisma') {
    const current = memory.requests.get(eventRequestId);
    if (!current || current.version !== version || current.status !== 'SUBMITTED') return { conflict: true };
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
      await require('./readiness').lock(tx,eventRequestId);
      if(key){const cached=await tx.idempotencyRecord.findUnique({where:{actorId_key:{actorId:actor.id,key}}});if(cached){if(cached.requestHash!==hash)throw Object.assign(new Error('Action key used with different data'),{status:409,code:'IDEMPOTENCY_CONFLICT'});return {result:cached.responseBody};}}
      const current = await tx.technicalRequest.findUnique({ where: { eventRequestId } });
      if (!current || current.version !== version || current.status !== 'SUBMITTED') return { conflict: true };
      if(!config.isTest){
       const source=await require('./eventContext').requestContext(eventRequestId);
       if(source.eventId!==current.planningEventId||source.requirementsRevision!==current.requirementsRevision||source.status!=='ARRANGEMENT_PENDING'||['PREPARING','PENDING','APPROVED'].includes(source.safetyState))return {conflict:true};
       if(decision==='APPROVED'&&require('./coverage').missingCoverage(source,current.requirements,coverageResolution).length)return {conflict:true};
      }
      await require('./readiness').invalidateRequest(eventRequestId,tx);
      const changed = await tx.technicalRequest.updateMany({
        where: { id: current.id, version, status: 'SUBMITTED' },
        data: { coverageResolution:coverageResolution||require('@prisma/client').Prisma.DbNull,status: decision, decisionReason: decision === 'REJECTED' ? reason : null, decidedById: actor.id, decidedAt: new Date(now) },
      });
      if (changed.count !== 1) return { conflict: true };
      const record = await tx.technicalRequest.findUnique({ where: { id: current.id } });
      const actionKey = `TechRequestDecided:${eventRequestId}:v${version}`;
      await tx.technicalRequestHistory.create({ data: { requestId: current.id, version, action: 'TechRequestDecided', actorId: actor.id, actorRole: actor.role, details: { decision, reason: decision === 'REJECTED' ? reason : null } } });
      await tx.outboxEvent.create({ data: { actionKey, eventType: 'TechRequestDecided', payload: requestView(record) } });
      const result = requestView(record);
      if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: result } });
      return { result };
    }, {isolationLevel:'ReadCommitted',timeout:15000,maxWait:10000});
  }
  catch (error) {
    if (error.code === 'P2002' || error.code === 'P2034') return { conflict: true };
    throw error;
  }
}

module.exports = { listEquipmentTypes, findRequest, listRequests, findIdempotency, requestHash, saveSubmission, saveDecision, requestView };
