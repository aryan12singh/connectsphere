const test = require('node:test');
const assert = require('node:assert/strict');
const { inventory, update } = require('../../src/inventory');

test('memory inventory lists sorted stock and applies a versioned update', async () => {
  const before = await inventory();
  assert.deepEqual(before.items.map(item => item.equipmentType), [...before.items.map(item => item.equipmentType)].sort());
  const projector = before.items.find(item => item.equipmentType === 'projector');
  const saved = await update('projector', { total: 7, version: projector.version });
  assert.equal(saved.total, 7);
  assert.equal(saved.version, projector.version + 1);
  assert.equal((await inventory()).items.find(item => item.equipmentType === 'projector').total, 7);
});

test('inventory rejects unknown stock, invalid totals, and stale versions without overwriting newer stock', async () => {
  for (const [type, body] of [
    ['unknown', { total: 1, version: 1 }],
    ['projector', { total: -1, version: 1 }],
    ['projector', { total: 1.5, version: 1 }],
    ['projector', { total: 1, version: 0 }],
    ['projector', { total: 1000001, version: 1 }],
  ]) await assert.rejects(update(type, body), error => error.status === 422);
  await assert.rejects(update('projector', { total: 8, version: 1 }), error => error.status === 409);
  assert.equal((await inventory()).items.find(item => item.equipmentType === 'projector').total, 7);
});

test('Prisma inventory ensures catalog rows, locks stock before update, and rejects a stale version', async t => {
  const config = require('../../src/config');
  const inventoryPath = require.resolve('../../src/inventory');
  const dbPath = require.resolve('../../src/db');
  const originalConfig = config.dataMode;
  const originalInventoryModule = require.cache[inventoryPath];
  const originalDbModule = require.cache[dbPath];
  const rows = new Map();
  let locked = false;
  const equipmentStock = {
    async upsert({ where, create }) { if (!rows.has(where.equipmentType)) rows.set(where.equipmentType, { ...create, version: 1 }); },
    async findMany() { return [...rows.values()].sort((a, b) => a.equipmentType.localeCompare(b.equipmentType)); },
    async findUnique({ where }) { return rows.get(where.equipmentType); },
    async update({ where, data }) { const current = rows.get(where.equipmentType); const saved = { ...current, total: data.total, version: current.version + 1 }; rows.set(where.equipmentType, saved); return saved; },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    equipmentStock,
    async $transaction(run) { return run({ equipmentStock, async $queryRaw() { locked = true; } }); },
  } };
  config.dataMode = 'prisma';
  delete require.cache[inventoryPath];
  const prismaInventory = require('../../src/inventory');
  t.after(() => {
    config.dataMode = originalConfig;
    if (originalInventoryModule) require.cache[inventoryPath] = originalInventoryModule;
    else delete require.cache[inventoryPath];
    if (originalDbModule) require.cache[dbPath] = originalDbModule;
    else delete require.cache[dbPath];
  });
  const listed = await prismaInventory.inventory();
  assert.equal(listed.items.length, 5);
  rows.set('camera', { equipmentType: 'camera', total: 2, version: 3 });
  const savedCatalogType = await prismaInventory.update('camera', { total: 4, version: 3 });
  assert.deepEqual([savedCatalogType.total, savedCatalogType.version], [4, 4]);
  const saved = await prismaInventory.update('projector', { total: 6, version: 1 });
  assert.equal(locked, true);
  assert.deepEqual([saved.total, saved.version], [6, 2]);
  await assert.rejects(prismaInventory.update('projector', { total: 7, version: 1 }), error => error.status === 409);
});
