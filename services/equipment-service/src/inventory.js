const config = require('./config');
const prisma = require('./db');
const types = ['projector', 'microphone', 'speaker', 'lighting', 'stage'];
const memory = new Map(types.map(equipmentType => {
  const now = new Date().toISOString();
  return [equipmentType, { equipmentType, total: config.isTest ? 5 : 0, version: 1, createdAt: now, updatedAt: now }];
}));

async function inventory() {
  if (config.dataMode !== 'prisma') return { items: [...memory.values()].sort((a, b) => a.equipmentType.localeCompare(b.equipmentType)) };
  await ensure(prisma);
  return { items: await prisma.equipmentStock.findMany({ orderBy: { equipmentType: 'asc' } }) };
}

async function ensure(db) {
  for (const equipmentType of types) {
    await db.equipmentStock.upsert({ where: { equipmentType }, create: { equipmentType, total: 0 }, update: {} });
  }
}

async function update(equipmentType, body) {
  const currentInventory = await inventory();
  const currentItem = currentInventory.items.find(item => item.equipmentType === equipmentType);
  if (!currentItem || !Number.isSafeInteger(body?.total) || body.total < 0 || body.total > 1000000 || !Number.isSafeInteger(body?.version) || body.version < 1) {
    throw Object.assign(new Error('Use a known equipment type, non-negative whole stock total and current version.'), { status: 422, code: 'VALIDATION_FAILED' });
  }
  if (config.dataMode !== 'prisma') {
    const current = currentItem;
    if (current.version !== body.version) throw Object.assign(new Error('Inventory changed. Refresh before editing.'), { status: 409, code: 'STALE_VERSION' });
    if (body.total < current.total) {
      const affected = require('./operations')._memory.reservations.filter(row => row.active && row.equipmentType === equipmentType);
      for (const eventRequestId of new Set(affected.map(row => row.eventRequestId))) await require('./readiness').invalidateRequest(eventRequestId);
    }
    const saved = { ...current, equipmentType, total: body.total, version: current.version + 1, updatedAt: new Date().toISOString() };
    memory.set(equipmentType, saved);
    return saved;
  }
  return prisma.$transaction(async tx => {
    await ensure(tx);
    await tx.$queryRaw`SELECT "equipmentType" FROM equipment_stock WHERE "equipmentType"=${equipmentType} FOR UPDATE`;
    const current = await tx.equipmentStock.findUnique({ where: { equipmentType } });
    if (current.version !== body.version) throw Object.assign(new Error('Inventory changed. Refresh before editing.'), { status: 409, code: 'STALE_VERSION' });
    if (body.total < current.total) {
      const affected = await tx.equipmentReservation.findMany({ where: { active: true, equipmentType } });
      for (const eventRequestId of new Set(affected.map(row => row.eventRequestId))) await require('./readiness').invalidateRequest(eventRequestId, tx);
    }
    return tx.equipmentStock.update({ where: { equipmentType }, data: { total: body.total, version: { increment: 1 } } });
  }, { timeout: 15000 });
}

module.exports = { inventory, update };
