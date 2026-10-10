const crypto = require('node:crypto');
const config = require('./config');
const prisma = require('./db');

const memory = { requests: new Map(), events: new Map(), assignments: [], activity: [], outbox: [], idempotency: new Map() };
const id = () => crypto.randomUUID();
const now = () => new Date();

function clean(row) {
  if (!row) return null;
  return { ...row, accessibilityNeeds: row.accessibilityNeeds || [], equipmentNeeds: row.equipmentNeeds || [], event: row.event || null };
}

function reset() {
  if (config.dataMode !== 'memory') return;
  memory.requests.clear(); memory.events.clear(); memory.assignments.length = 0; memory.activity.length = 0; memory.outbox.length = 0; memory.idempotency.clear();
}

function requestHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function findIdempotency(userId, key, method = 'POST', path = '/event-requests') {
  if (!key) return null;
  if (config.dataMode === 'memory') return memory.idempotency.get(`${userId}:${key}`) || null;
  return prisma.idempotencyRecord.findUnique({ where: { userId_key_method_path: { userId, key, method, path } } });
}
async function saveIdempotency(data) {
  if (config.dataMode === 'memory') { memory.idempotency.set(`${data.userId}:${data.key}`, data); return data; }
  return prisma.idempotencyRecord.create({ data });
}

async function createRequest(data) {
  if (config.dataMode === 'memory') {
    const row = { id: id(), version: 1, status: 'DRAFT', createdAt: now(), updatedAt: now(), ...data };
    memory.requests.set(row.id, row);
    return clean(row);
  }
  return clean(await prisma.eventRequest.create({ data, include: { event: true } }));
}

async function findRequest(requestId) {
  if (config.dataMode === 'memory') return clean(memory.requests.get(requestId));
  return clean(await prisma.eventRequest.findUnique({ where: { id: requestId }, include: { event: true } }));
}

async function listRequests(where = {}) {
  if (config.dataMode === 'memory') {
    return [...memory.requests.values()]
      .filter(row => Object.entries(where).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
      .sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt))
      .map(clean);
  }
  const prismaWhere = { ...where, ...(Array.isArray(where.status) ? { status: { in: where.status } } : {}) };
  const rows = await prisma.eventRequest.findMany({ where: prismaWhere, include: { event: true }, orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }] });
  return rows.map(clean);
}

async function updateRequest(requestId, data, version) {
  if (config.dataMode === 'memory') {
    const current = memory.requests.get(requestId);
    if (!current || (version != null && current.version !== version)) return null;
    const updated = { ...current, ...data, version: current.version + 1, updatedAt: now() };
    memory.requests.set(requestId, updated);
    return clean(updated);
  }
  try {
    const updated = version == null
      ? await prisma.eventRequest.update({ where: { id: requestId }, data: { ...data, version: { increment: 1 } }, include: { event: true } })
      : await prisma.$transaction(async (tx) => {
          const changed = await tx.eventRequest.updateMany({ where: { id: requestId, version }, data: { ...data, version: { increment: 1 } } });
          if (changed.count !== 1) throw Object.assign(new Error('stale'), { code: 'P2025' });
          return tx.eventRequest.findUnique({ where: { id: requestId }, include: { event: true } });
        });
    return clean(updated);
  } catch (error) {
    if (error?.code === 'P2025') return null;
    throw error;
  }
}

async function assignCoordinator(requestId, coordinatorId, assignedById = null, reason = 'AUTO') {
  if (config.dataMode === 'memory') {
    memory.assignments.forEach(assignment => { if (assignment.requestId === requestId && !assignment.revokedAt) assignment.revokedAt = now(); });
    const assignment = { id: id(), requestId, coordinatorId, assignedById, reason, assignedAt: now(), revokedAt: null };
    memory.assignments.push(assignment);
    const request = memory.requests.get(requestId);
    if (request) { request.currentCoordinatorId = coordinatorId; request.updatedAt = now(); }
    return assignment;
  }
  await prisma.coordinatorAssignment.updateMany({ where: { eventRequestId: requestId, revokedAt: null }, data: { revokedAt: now(), revokedById: assignedById } });
  const assignment = await prisma.coordinatorAssignment.create({ data: { eventRequestId: requestId, coordinatorId, assignedById, reason } });
  await prisma.eventRequest.update({ where: { id: requestId }, data: { currentCoordinatorId: coordinatorId } });
  return assignment;
}

async function currentAssignment(requestId) {
  if (config.dataMode === 'memory') return memory.assignments.find(assignment => assignment.requestId === requestId && !assignment.revokedAt) || null;
  return prisma.coordinatorAssignment.findFirst({ where: { eventRequestId: requestId, revokedAt: null }, orderBy: { assignedAt: 'desc' } });
}

async function activeCounts() {
  const rows = config.dataMode === 'memory' ? [...memory.requests.values()] : await prisma.eventRequest.findMany({ include: { event: true } });
  const counts = {};
  for (const row of rows) {
    const active = row.status === 'SUBMITTED' || row.status === 'RETURNED_FOR_AMENDMENT' || (row.status === 'APPROVED' && ['ARRANGEMENT_PENDING', 'CONFIRMED'].includes(row.event?.status));
    if (active && row.currentCoordinatorId) counts[row.currentCoordinatorId] = (counts[row.currentCoordinatorId] || 0) + 1;
  }
  return counts;
}

async function createEvent(data) {
  if (config.dataMode === 'memory') {
    const row = { id: id(), version: 1, status: 'ARRANGEMENT_PENDING', createdAt: now(), updatedAt: now(), ...data };
    memory.events.set(row.id, row);
    const request = memory.requests.get(data.eventRequestId);
    if (request) request.event = row;
    return row;
  }
  return prisma.event.create({ data });
}

async function listEvents(where = {}) {
  if (config.dataMode === 'memory') return [...memory.events.values()].filter(row => Object.entries(where).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
  const prismaWhere = { ...where, ...(Array.isArray(where.status) ? { status: { in: where.status } } : {}) };
  return prisma.event.findMany({ where: prismaWhere, orderBy: { startAt: 'asc' } });
}

async function addActivity(data) {
  if (config.dataMode === 'memory') { memory.activity.push({ id: id(), createdAt: now(), ...data }); return; }
  await prisma.activityLog.create({ data });
}

async function addOutbox(data) {
  if (config.dataMode === 'memory') { memory.outbox.push({ id: id(), createdAt: now(), ...data }); return; }
  await prisma.outbox.create({ data });
}

async function listActivity(requestId) {
  if (config.dataMode === 'memory') return memory.activity.filter(row => row.eventRequestId === requestId).sort((a, b) => b.createdAt - a.createdAt);
  return prisma.activityLog.findMany({ where: { eventRequestId: requestId }, orderBy: { createdAt: 'desc' } });
}

module.exports = { reset, requestHash, findIdempotency, saveIdempotency, createRequest, findRequest, listRequests, updateRequest, assignCoordinator, currentAssignment, activeCounts, createEvent, listEvents, addActivity, addOutbox, listActivity };
