const config = require('./config');
const prisma = require('./db');
const inventory = require('./inventory');
const { availabilityLine } = require('./domain/equipment-availability');

// The memory implementation deliberately mirrors the transactional operations
// below. It is used only by deterministic service tests; production uses the
// PostgreSQL branch and stock rows are locked in equipment-type order.
const memory = { reservations: [], operations: [], idempotency: new Map() };

function period(value) {
  const start = Date.parse(value?.startAt);
  const end = Date.parse(value?.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw Object.assign(new Error('A current positive equipment period is required.'), { status: 422, code: 'VALIDATION_FAILED' });
  }
  return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}

function validateOperation(body, known, stock) {
  const input = { ...body, equipmentType: body?.equipmentType || body?.type };
  if (!known.includes(input.equipmentType) || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > stock || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) {
    throw Object.assign(new Error('Use a known type, a positive quantity within stock, and a reason of at most 500 characters.'), { status: 422, code: 'VALIDATION_FAILED' });
  }
  return { ...input, reason: input.reason.trim(), ...period(input) };
}

function lineResult(requirements, stockByType, reservations, operations, window) {
  return requirements.equipment.map(line => {
    const commitments = [...reservations, ...operations]
      .filter(item => item.equipmentType === line.equipmentType && item.active !== false)
      .map(item => ({ startAt: item.startAt, endAt: item.endAt, quantity: item.quantity }));
    return { equipmentType: line.equipmentType, ...availabilityLine(stockByType.get(line.equipmentType) || 0, line.quantity, commitments, window.startAt, window.endAt) };
  });
}

async function stockMap() {
  const data = await inventory.inventory();
  return new Map(data.items.map(item => [item.equipmentType, item.total]));
}

async function availability({ request, window, excludeEventRequestId = null }) {
  const normalized = period(window);
  const stocks = await stockMap();
  if (config.dataMode !== 'prisma') {
    const lines = lineResult(request.requirements, stocks, memory.reservations.filter(row => row.eventRequestId !== excludeEventRequestId), memory.operations, normalized);
    const result = { requestVersion: request.version, period: normalized, lines, fulfillable: lines.every(line => line.shortfall === 0), checkedAt: new Date().toISOString() };
    return result;
  }
  const [reservations, operations] = await Promise.all([
    prisma.equipmentReservation.findMany({ where: { active: true, ...(excludeEventRequestId ? { eventRequestId: { not: excludeEventRequestId } } : {}) } }),
    prisma.equipmentOperationalUnavailability.findMany(),
  ]);
  const lines = lineResult(request.requirements, stocks, reservations, operations, normalized);
  const result = { requestVersion: request.version, period: normalized, lines, fulfillable: lines.every(line => line.shortfall === 0), checkedAt: new Date().toISOString() };
  return result;
}

async function reserve({ request, window, actor, key, hash, sourceVersions = {} }) {
  if (request.status !== 'APPROVED') throw Object.assign(new Error('Current Technical Support approval is required.'), { status: 409, code: 'STALE_VERSION' });
  const normalized = period(window);
  if (config.dataMode !== 'prisma') {
    const replay = key && memory.idempotency.get(`${actor.id}:${key}`);
    if (replay) {
      if (replay.hash !== hash) throw Object.assign(new Error('This action key was already used for a different request.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      return { ...replay.value, replayed: true };
    }
    const existing = memory.reservations.filter(row => row.eventRequestId === request.eventRequestId && row.requestVersion === request.version && row.active !== false);
    if (existing.length) {
      const value = { requestVersion: request.version, period: { startAt: existing[0].startAt, endAt: existing[0].endAt }, reservations: existing, sourceVersions: existing[0].sourceVersions };
      if (key) memory.idempotency.set(`${actor.id}:${key}`, { hash, value });
      return value;
    }
    const check = await availability({ request, window: normalized, excludeEventRequestId: request.eventRequestId });
    if (!check.fulfillable) throw Object.assign(new Error('Equipment is unavailable for one or more lines.'), { status: 409, code: 'EQUIPMENT_SHORTFALL', lines: check.lines });
    const old = memory.reservations.filter(row => row.eventRequestId === request.eventRequestId && row.active);
    const rows = request.requirements.equipment.map(line => ({ id: crypto.randomUUID(), eventRequestId: request.eventRequestId, eventId: request.planningEventId || request.eventRequestId, requestVersion: request.version, equipmentType: line.equipmentType, quantity: line.quantity, ...normalized, active: true, actorId: actor.id, sourceVersions, createdAt: new Date().toISOString() }));
    old.forEach(row => { row.active = false; });
    memory.reservations.push(...rows);
    const value = { requestVersion: request.version, period: normalized, reservations: rows, sourceVersions };
    if (key) memory.idempotency.set(`${actor.id}:${key}`, { hash, value });
    return value;
  }
  try { return await prisma.$transaction(async tx => {
    const replay = key && await tx.idempotencyRecord.findUnique({ where: { actorId_key: { actorId: actor.id, key } } });
    if (replay) {
      if (replay.requestHash !== hash) throw Object.assign(new Error('This action key was already used for a different request.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      return { ...replay.responseBody, replayed: true };
    }
    const current = await tx.technicalRequest.findUnique({ where: { eventRequestId: request.eventRequestId } });
    if (!current || current.version !== request.version || current.status !== 'APPROVED') throw Object.assign(new Error('Technical requirements changed. Reload and retry.'), { status: 409, code: 'STALE_VERSION' });
    const existing = await tx.equipmentReservation.findMany({
      where: { eventRequestId: request.eventRequestId, requestVersion: request.version, active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing.length) {
      const value = {
        requestVersion: request.version,
        period: { startAt: existing[0].startAt, endAt: existing[0].endAt },
        reservations: existing,
        sourceVersions: existing[0].sourceVersions,
      };
      if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: value } });
      return value;
    }
    const types = [...new Set(request.requirements.equipment.map(line => line.equipmentType))].sort();
    for (const type of types) await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${type} FOR UPDATE`;
    const [stocks, reservations, operations] = await Promise.all([
      tx.equipmentStock.findMany({ where: { equipmentType: { in: types } } }),
      tx.equipmentReservation.findMany({ where: { active: true, eventRequestId: { not: request.eventRequestId } } }),
      tx.equipmentOperationalUnavailability.findMany(),
    ]);
    const check = { lines: lineResult(request.requirements, new Map(stocks.map(row => [row.equipmentType, row.total])), reservations, operations, normalized) };
    if (check.lines.some(line => line.shortfall)) throw Object.assign(new Error('Equipment is unavailable for one or more lines.'), { status: 409, code: 'EQUIPMENT_SHORTFALL', lines: check.lines });
    await tx.equipmentReservation.updateMany({ where: { eventRequestId: request.eventRequestId, active: true }, data: { active: false } });
    const rows = [];
    for (const line of request.requirements.equipment) rows.push(await tx.equipmentReservation.create({ data: { id: crypto.randomUUID(), eventRequestId: request.eventRequestId, eventId: request.planningEventId || request.eventRequestId, requestVersion: request.version, equipmentType: line.equipmentType, quantity: line.quantity, startAt: new Date(normalized.startAt), endAt: new Date(normalized.endAt), actorId: actor.id, sourceVersions } }));
    const value = { requestVersion: request.version, period: normalized, reservations: rows, sourceVersions };
    await tx.technicalRequestHistory.create({ data: { requestId: current.id, version: request.version, action: 'EquipmentReserved', actorId: actor.id, actorRole: actor.role, details: value } });
    await tx.outboxEvent.create({ data: { actionKey: `EquipmentReserved:${request.eventRequestId}:v${request.version}`, eventType: 'EquipmentReserved', payload: value } });
    if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: value } });
    return value;
  }, { isolationLevel: 'Serializable' }); }
  catch (error) {
    if (!['P2034', 'P2002'].includes(error.code)) throw error;
    const replay = key && await prisma.idempotencyRecord.findUnique({ where: { actorId_key: { actorId: actor.id, key } } });
    if (replay && replay.requestHash === hash) return { ...replay.responseBody, replayed: true };
    throw Object.assign(new Error('Equipment commitments changed during reservation. Refresh availability and retry.'), { status: 409, code: 'CONCURRENT_RESERVATION' });
  }
}

async function reservedRequestIds(requests) {
  if (!requests.length) return new Set();
  const versions = new Map(requests.map(request => [request.eventRequestId, request.version]));
  if (config.dataMode !== 'prisma') {
    return new Set(memory.reservations
      .filter(row => row.active !== false && versions.get(row.eventRequestId) === row.requestVersion)
      .map(row => row.eventRequestId));
  }
  const rows = await prisma.equipmentReservation.findMany({
    where: { active: true, eventRequestId: { in: [...versions.keys()] } },
    select: { eventRequestId: true, requestVersion: true },
  });
  return new Set(rows
    .filter(row => versions.get(row.eventRequestId) === row.requestVersion)
    .map(row => row.eventRequestId));
}

async function createOperation({ body, actor, key }) {
  const hash = JSON.stringify({ action: 'operational-unavailability', body });
  const replay = key && (config.dataMode === 'prisma'
    ? await prisma.idempotencyRecord.findUnique({ where: { actorId_key: { actorId: actor.id, key } } })
    : memory.idempotency.get(`${actor.id}:${key}`));
  if (replay) {
    if ((replay.requestHash || replay.hash) !== hash) throw Object.assign(new Error('This action key was already used for different operation data.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    return replay.responseBody || replay.value;
  }
  const current = await inventory.inventory();
  const stock = current.items.find(item => item.equipmentType === (body?.equipmentType || body?.type));
  const known = current.items.map(item => item.equipmentType);
  const value = validateOperation(body, known, stock?.total || 0);
  if (config.dataMode !== 'prisma') {
    const item = { id: crypto.randomUUID(), ...value, actorId: actor.id, version: 1, createdAt: new Date().toISOString() };
    memory.operations.push(item);
    if (key) memory.idempotency.set(`${actor.id}:${key}`, { hash, value: item });
    return item;
  }
  try { return await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${value.equipmentType} FOR UPDATE`;
    const saved = await tx.equipmentOperationalUnavailability.create({ data: { id: crypto.randomUUID(), equipmentType: value.equipmentType, quantity: value.quantity, reason: value.reason, startAt: new Date(value.startAt), endAt: new Date(value.endAt), actorId: actor.id } });
    if (key) await tx.idempotencyRecord.create({ data: { actorId: actor.id, key, requestHash: hash, responseBody: JSON.parse(JSON.stringify(saved)) } });
    return saved;
  }); } catch (error) {
    if (error.code !== 'P2002') throw error;
    const saved = key && await prisma.idempotencyRecord.findUnique({ where: { actorId_key: { actorId: actor.id, key } } });
    if (saved?.requestHash === hash) return saved.responseBody;
    throw Object.assign(new Error('This operation changed concurrently. Refresh and retry.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
  }
}

module.exports = { availability, reserve, reservedRequestIds, createOperation, _memory: memory };
