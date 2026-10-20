const test = require('node:test');
const assert = require('node:assert/strict');
const { requestContext, eventContext, equipmentAllocationContext } = require('../../src/eventContext');

test('event context readers encode IDs and return validated request, planning, and buffered allocation data', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const seen = [];
  global.fetch = async (url, options) => {
    seen.push({ url, options });
    if (url.includes('/technical-context')) return Response.json({ eventRequestId: 'request/1', eventId: 'event-1', requirementsRevision: 3, currentCoordinatorId: 'coord-1' });
    if (url.includes('/planning-context')) return Response.json({ id: 'event-1', technicalRequirementsRevision: 4 });
    return Response.json({ eventId: 'event-1', allocations: [], checkedAt: '2026-10-17T10:00:00Z' });
  };
  assert.equal((await requestContext('request/1')).currentCoordinatorId, 'coord-1');
  assert.equal((await eventContext('event-1')).requirementsRevision, 4);
  assert.equal((await equipmentAllocationContext('event-1')).allocations.length, 0);
  assert.ok(seen[0].url.includes('request%2F1'));
  assert.equal(seen[0].options.headers['x-internal-api-key'], 'change-me-dev-internal-key');
});

test('event context fails closed for upstream errors, incomplete payloads, and network failures', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => Response.json({});
  await assert.rejects(requestContext('request-1'), error => error.status === 503);
  await assert.rejects(eventContext('event-1'), error => error.status === 503);
  await assert.rejects(equipmentAllocationContext('event-1'), error => error.status === 503);
  global.fetch = async () => new Response(null, { status: 404 });
  await assert.rejects(requestContext('missing'), error => error.status === 404);
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(equipmentAllocationContext('event-1'), error => error.status === 503 && error.code === 'EVENT_UNAVAILABLE');
});
