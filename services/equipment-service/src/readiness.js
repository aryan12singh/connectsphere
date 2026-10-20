const config = require('./config');
const prisma = require('./db');
const store = require('./store');

const memoryFences = new Map();

async function current(eventId) {
  const requests = (await store.listRequests()).filter(request => (request.planningEventId || request.eventRequestId) === eventId);
  const request = requests.sort((a, b) => b.version - a.version)[0];
  if (!request) return { eventId, status: 'UNVERIFIED', reason: 'TECHNICAL_REQUEST_MISSING', equipment: [] };
  if (request.status === 'NOT_REQUIRED') return { eventId, status: 'NOT_REQUIRED', fingerprint: `${request.eventRequestId}:v${request.version}`, equipment: [] };
  if (request.status !== 'APPROVED') return { eventId, status: 'PENDING', reason: 'TECHNICAL_APPROVAL_REQUIRED', equipment: request.requirements.equipment || [] };
  const active = config.dataMode === 'prisma'
    ? await prisma.equipmentReservation.findMany({ where: { eventRequestId: request.eventRequestId, active: true } })
    : require('./operations')._memory.reservations.filter(row => row.eventRequestId === request.eventRequestId && row.active);
  const complete = active.length === request.requirements.equipment.length && request.requirements.equipment.every(line => active.some(row => row.requestVersion === request.version && row.equipmentType === line.equipmentType && row.quantity === line.quantity));
  if (!complete) return { eventId, status: 'PENDING', reason: 'RESERVATION_PROOF_MISSING', equipment: request.requirements.equipment || [] };
  if (active.length) {
    const window = { startAt: new Date(Math.min(...active.map(row => Date.parse(row.startAt)))).toISOString(), endAt: new Date(Math.max(...active.map(row => Date.parse(row.endAt)))).toISOString() };
    const supply = await require('./operations').availability({ request, window, excludeEventRequestId: request.eventRequestId });
    if (!supply.fulfillable) return { eventId, status: 'PENDING', reason: 'EQUIPMENT_OPERATION_CHANGED', equipment: request.requirements.equipment, affectedReservationIds: active.map(row => row.id) };
  }
  return { eventId, status: 'APPROVED', fingerprint: `${request.eventRequestId}:v${request.version}:${active.map(row => row.id).sort().join(',')}`, equipment: request.requirements.equipment || [], placementDetails: request.requirements.placementDetails || '' };
}

async function prepare(eventId, input) {
  if (typeof input?.token !== 'string' || !input.token || !Number.isInteger(input.generation)) throw Object.assign(new Error('Safety token and generation are required.'), { status: 422, code: 'VALIDATION_FAILED' });
  const proof = await current(eventId);
  if (!['APPROVED', 'NOT_REQUIRED'].includes(proof.status)) throw Object.assign(new Error('Current technical proof is required.'), { status: 409, code: 'TECHNICAL_NOT_READY' });
  if (config.dataMode === 'prisma') await prisma.technicalReadinessFence.upsert({ where: { token: input.token }, create: { token: input.token, eventId, eventRequestId: proof.fingerprint.split(':')[0] || eventId, proof }, update: { active: true, proof } });
  else memoryFences.set(input.token, { eventId, proof, active: true });
  return proof;
}

async function release(eventId, token) {
  if (!token) return { eventId, released: false };
  if (config.dataMode === 'prisma') {
    const updated = await prisma.technicalReadinessFence.updateMany({ where: { token, eventId, active: true }, data: { active: false } });
    return { eventId, released: updated.count === 1 };
  }
  const fence = memoryFences.get(token);
  if (!fence || fence.eventId !== eventId || !fence.active) return { eventId, released: false };
  fence.active = false;
  return { eventId, released: true };
}

module.exports = { current, prepare, release };
