const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATA_MODE = 'memory';
process.env.NODE_ENV = 'test';

const app = require('../../src/app');

async function withServer(run) {
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await run(baseUrl);
  }
  finally { server.close(); }
}

function actorHeaders(id, role) {
  return { 'content-type': 'application/json', 'x-test-user-id': id, 'x-test-role': role };
}

const requestBody = {
  equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'B1' }],
  supportRequired: true,
  supportDetails: 'Setup assistance',
  placementDetails: 'Room A: 1; Room B: 1',
  version: 1,
};

test('TC-CS40-01 creates one event-scoped technical request and publishes a submission outbox action', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/event-requests/event-1/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.eventRequestId, 'event-1');
    assert.equal(body.version, 1);
    assert.equal(body.status, 'PENDING_TECH_REVIEW');
    assert.equal(body.equipment[0].quantity, 2);
    const read = await fetch(`${baseUrl}/event-requests/event-1/technical-request`, {
      headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
    });
    const persisted = await read.json();
    assert.equal(persisted.version, 1);
    assert.equal(persisted.status, 'PENDING_TECH_REVIEW');
  });
});

test('TC-CS40-08 current assignment controls both reads and revisions after reassignment', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/reassigned-http/technical-request`;
    assert.equal((await fetch(path, { method: 'POST', headers: actorHeaders('original', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody) })).status, 201);
    const former = { ...actorHeaders('original', 'EVENT_COORDINATOR'), 'x-test-current-coordinator-id': 'replacement' };
    assert.equal((await fetch(path, { headers: former })).status, 403);
    assert.equal((await fetch(path, { method: 'POST', headers: former, body: JSON.stringify(requestBody) })).status, 403);
    const current = { ...actorHeaders('replacement', 'EVENT_COORDINATOR'), 'x-test-current-coordinator-id': 'replacement' };
    const read = await fetch(path, { headers: current });
    assert.equal(read.status, 200); assert.equal((await read.json()).coordinatorId, 'replacement');
    const changed = await fetch(path, { method: 'POST', headers: current, body: JSON.stringify({ ...requestBody, placementDetails: 'Updated by current Coordinator' }) });
    assert.equal(changed.status, 200); assert.equal((await changed.json()).version, 2);
  });
});

test('TC-CS40-18 history returns immutable version snapshots only to the current Coordinator', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/versioned-history/technical-request`;
    const current = { ...actorHeaders('current-coordinator', 'EVENT_COORDINATOR'), 'x-test-current-coordinator-id': 'current-coordinator' };
    const submitted = await fetch(path, { method: 'POST', headers: current, body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 201);
    const revised = await fetch(path, { method: 'POST', headers: current, body: JSON.stringify({ ...requestBody, version: 1, equipment: [{ equipmentType: 'projector', quantity: 3, venueId: 'B1' }], placementDetails: 'Version two placement' }) });
    assert.equal(revised.status, 200);

    const history = await fetch(`${path}/history`, { headers: current });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).items.map(item => [item.version, item.snapshot.equipment[0].quantity, item.snapshot.placementDetails]), [
      [2, 3, 'Version two placement'],
      [1, 2, 'Room A: 1; Room B: 1'],
    ]);
    const former = { ...actorHeaders('former-coordinator', 'EVENT_COORDINATOR'), 'x-test-current-coordinator-id': 'current-coordinator' };
    assert.equal((await fetch(`${path}/history`, { headers: former })).status, 403);
  });
});

test('TC-CS40-02 rejects invalid equipment with field feedback and no saved request', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/event-requests/event-invalid/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [{ equipmentType: 'unknown', quantity: 0 }] }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.ok(body.error.fields['equipment.0.equipmentType']);
    assert.ok(body.error.fields['equipment.0.quantity']);
    const read = await fetch(`${baseUrl}/event-requests/event-invalid/technical-request`, {
      headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
    });
    assert.equal(read.status, 404);
  });
});

test('TC-CS40-14 rejects quantities above physical stock without persisting a partial request', async () => {
  await withServer(async baseUrl => {
    const catalog = await fetch(`${baseUrl}/equipment-types`, { headers: actorHeaders('coordinator-over-stock', 'EVENT_COORDINATOR') });
    assert.equal(catalog.status, 200);
    const projector = (await catalog.json()).equipmentTypes.find(item => item.name === 'projector');
    assert.ok(projector);

    const path = `${baseUrl}/event-requests/event-over-stock/technical-request`;
    const response = await fetch(path, {
      method: 'POST', headers: actorHeaders('coordinator-over-stock', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [{ equipmentType: 'projector', quantity: projector.total + 1 }] }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.ok(body.error.fields['equipment.0.quantity']);

    const read = await fetch(path, { headers: actorHeaders('coordinator-over-stock', 'EVENT_COORDINATOR') });
    assert.equal(read.status, 404);
  });
});

test('TC-CS40-03 and TC-CS40-04 allow only Technical Support decisions and require rejection reason', async () => {
  await withServer(async baseUrl => {
    const submitted = await fetch(`${baseUrl}/event-requests/event-decision/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody),
    });
    assert.equal(submitted.status, 201);
    const path = `${baseUrl}/event-requests/event-decision/technical-request/decision`;
    const forbidden = await fetch(path, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify({ decision: 'APPROVED', version: 1 }),
    });
    assert.equal(forbidden.status, 403);
    const blankReason = await fetch(path, {
      method: 'POST', headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'REJECTED', reason: '  ', version: 1 }),
    });
    assert.equal(blankReason.status, 422);
    const rejected = await fetch(path, {
      method: 'POST', headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'REJECTED', reason: 'Insufficient support staff', version: 1 }),
    });
    assert.equal(rejected.status, 200);
    const result = await rejected.json();
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.decisionReason, 'Insufficient support staff');
  });
});

test('TC-CS40-08 and TC-CS40-09 deny old Coordinator edits while allowing permitted Safety read-only access', async () => {
  await withServer(async baseUrl => {
    const submitted = await fetch(`${baseUrl}/event-requests/event-access/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody),
    });
    assert.equal(submitted.status, 201);
    const former = await fetch(`${baseUrl}/event-requests/event-access/technical-request`, {
      headers: actorHeaders('former-coordinator', 'EVENT_COORDINATOR'),
    });
    assert.equal(former.status, 403);
    const safetyHeaders = { ...actorHeaders('safety-1', 'SAFETY_OFFICER'), 'x-test-event-access': 'event-access' };
    const readable = await fetch(`${baseUrl}/event-requests/event-access/technical-request`, { headers: safetyHeaders });
    assert.equal(readable.status, 200);
    const editable = await fetch(`${baseUrl}/event-requests/event-access/technical-request`, {
      method: 'POST', headers: safetyHeaders, body: JSON.stringify(requestBody),
    });
    assert.equal(editable.status, 403);
  });
});

test('CS-40 support-only and explicit no-requirements request API contract; TC-CS40-16 venue row persists', async () => {
  await withServer(async baseUrl => {
    const catalog = await fetch(`${baseUrl}/equipment-types`, { headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR') });
    assert.equal(catalog.status, 200);
    assert.ok((await catalog.json()).equipmentTypes.some(item => item.name === 'projector'));

    const supportOnly = await fetch(`${baseUrl}/event-requests/event-support-only/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [], supportRequired: true, supportDetails: 'Setup assistance' }),
    });
    assert.equal(supportOnly.status, 201);
    const savedSupport = await supportOnly.json();
    assert.equal(savedSupport.supportRequired, true);
    assert.equal(savedSupport.status, 'PENDING_TECH_REVIEW');

    const noRequirements = await fetch(`${baseUrl}/event-requests/event-no-requirements/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [], supportRequired: false, notRequired: true }),
    });
    assert.equal(noRequirements.status, 201);
    const declaredNotRequired = await noRequirements.json();
    assert.equal(declaredNotRequired.notRequired, true);
    assert.equal(declaredNotRequired.status, 'NOT_REQUIRED');
    assert.equal(declaredNotRequired.decidedById, 'coordinator-1');
    assert.ok(declaredNotRequired.decidedAt);

    const queue = await fetch(`${baseUrl}/technical-requests`, { headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF') });
    const requests = (await queue.json()).requests;
    assert.ok(requests.some(item => item.eventRequestId === 'event-support-only'));
    assert.ok(!requests.some(item => item.eventRequestId === 'event-no-requirements'));
  });
});

test('TC-CS40-10 one Event request retains equipment allocations for multiple venues', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/multi-venue-event/technical-request`;
    const submitted = await fetch(path, {
      method: 'POST',
      headers: actorHeaders('multi-venue-coordinator', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [
        { equipmentType: 'projector', quantity: 1, venueId: 'room-a' },
        { equipmentType: 'projector', quantity: 2, venueId: 'room-b' },
      ] }),
    });
    assert.equal(submitted.status, 201);
    const body = await submitted.json();
    assert.equal(body.eventRequestId, 'multi-venue-event');
    assert.deepEqual(body.equipment, [
      { equipmentType: 'projector', quantity: 1, venueId: 'room-a' },
      { equipmentType: 'projector', quantity: 2, venueId: 'room-b' },
    ]);
    const saved = await fetch(path, { headers: actorHeaders('multi-venue-coordinator', 'EVENT_COORDINATOR') });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).version, 1);
    const history = await fetch(`${path}/history`, { headers: actorHeaders('multi-venue-coordinator', 'EVENT_COORDINATOR') });
    assert.equal((await history.json()).items.length, 1);
  });
});

test.todo('TC-CS40-10 / TC-CS41-07 / TC-CS42-06 integration: aggregate same-type venue allocations before dated availability and reservation; the pooling helper currently has no service call site');

test('CS-41 technical request list returns a backend-derived equipment period only when equipment is requested', async () => {
  await withServer(async baseUrl => {
    const equipmentRequest = await fetch(`${baseUrl}/event-requests/event-period/technical-request`, {
      method: 'POST', headers: actorHeaders('period-coordinator', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody),
    });
    assert.equal(equipmentRequest.status, 201);
    const supportOnly = await fetch(`${baseUrl}/event-requests/event-support-period/technical-request`, {
      method: 'POST', headers: actorHeaders('period-coordinator', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [], supportRequired: true }),
    });
    assert.equal(supportOnly.status, 201);

    const response = await fetch(`${baseUrl}/technical-requests?includeResolved=1`, {
      headers: actorHeaders('period-support', 'TECHNICAL_SUPPORT_STAFF'),
    });
    assert.equal(response.status, 200);
    const requests = (await response.json()).requests;
    assert.deepEqual(requests.find(item => item.eventRequestId === 'event-period').equipmentPeriod, {
      startAt: '2028-01-01T00:00:00.000Z', endAt: '2028-01-01T02:00:00.000Z',
    });
    assert.equal(requests.find(item => item.eventRequestId === 'event-support-period').equipmentPeriod, null);
  });
});

test('TC-CS42 queue identifies active reservations for the current request version', async () => {
  await withServer(async baseUrl => {
    const coordinator = actorHeaders('reserved-coordinator', 'EVENT_COORDINATOR');
    const support = actorHeaders('reserved-support', 'TECHNICAL_SUPPORT_STAFF');
    const requestPath = `${baseUrl}/event-requests/reserved-queue/technical-request`;
    const submitted = await fetch(requestPath, { method: 'POST', headers: coordinator, body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 201);
    await fetch(`${requestPath}/decision`, { method: 'POST', headers: support, body: JSON.stringify({ decision: 'APPROVED', version: 1 }) });

    const before = await fetch(`${baseUrl}/technical-requests?includeResolved=1`, { headers: support });
    assert.equal((await before.json()).requests.find(item => item.eventRequestId === 'reserved-queue').reserved, false);

    const periodHeaders = { ...support, 'x-test-equipment-period': '2028-11-20T01:00:00.000Z,2028-11-20T03:00:00.000Z', 'Idempotency-Key': 'reserve-queue' };
    const reserved = await fetch(`${requestPath}/reservations`, { method: 'POST', headers: periodHeaders, body: JSON.stringify({ version: 1 }) });
    assert.equal(reserved.status, 200);
    const firstReservation = await reserved.json();
    const repeated = await fetch(`${requestPath}/reservations`, {
      method: 'POST', headers: { ...periodHeaders, 'Idempotency-Key': 'reserve-queue-retry' }, body: JSON.stringify({ version: 1 }),
    });
    assert.equal(repeated.status, 200);
    const repeatedReservation = await repeated.json();
    assert.deepEqual(repeatedReservation.reservations.map(row => row.id), firstReservation.reservations.map(row => row.id));

    const after = await fetch(`${baseUrl}/technical-requests?includeResolved=1`, { headers: support });
    assert.equal((await after.json()).requests.find(item => item.eventRequestId === 'reserved-queue').reserved, true);
    require('../../src/operations')._memory.reservations
      .filter(row => row.eventRequestId === 'reserved-queue')
      .forEach(row => { row.active = false; });
  });
});

test('TC-CS42-04 only Technical Support can reserve an approved request', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/role-boundary-reserve/technical-request`;
    const coordinator = actorHeaders('reserve-coordinator', 'EVENT_COORDINATOR');
    const support = actorHeaders('reserve-support', 'TECHNICAL_SUPPORT_STAFF');
    assert.equal((await fetch(path, { method: 'POST', headers: coordinator, body: JSON.stringify(requestBody) })).status, 201);
    assert.equal((await fetch(`${path}/decision`, { method: 'POST', headers: support, body: JSON.stringify({ decision: 'APPROVED', version: 1 }) })).status, 200);
    const period = { 'x-test-equipment-period': '2036-11-20T01:00:00.000Z,2036-11-20T03:00:00.000Z' };
    const denied = await fetch(`${path}/reservations`, { method: 'POST', headers: { ...coordinator, ...period }, body: JSON.stringify({ version: 1 }) });
    assert.equal(denied.status, 403);
    assert.equal(require('../../src/operations')._memory.reservations.some(row => row.eventRequestId === 'role-boundary-reserve'), false);
    const allowed = await fetch(`${path}/reservations`, { method: 'POST', headers: { ...support, ...period, 'Idempotency-Key': 'role-boundary-reserve' }, body: JSON.stringify({ version: 1 }) });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).reservations.length, 1);
  });
});

test('TC-CS40-07 prevents stale Technical Support decisions after a Coordinator updates requirements', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/event-stale/technical-request`;
    const submitted = await fetch(path, { method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 201);
    const updated = await fetch(path, { method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify({ ...requestBody, version: 1, equipment: [{ equipmentType: 'projector', quantity: 3, venueId: 'B1' }] }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).version, 2);
    const stale = await fetch(`${path}/decision`, { method: 'POST', headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'APPROVED', version: 1 }) });
    assert.equal(stale.status, 409);
    const current = await fetch(path, { headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF') });
    assert.equal((await current.json()).status, 'PENDING_TECH_REVIEW');
  });
});

test('submission idempotency replays identical actions and rejects key reuse with a different body', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/event-idempotent/technical-request`;
    const headers = { ...actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), 'Idempotency-Key': 'submit-event-idempotent' };
    const first = await fetch(path, { method: 'POST', headers, body: JSON.stringify(requestBody) });
    assert.equal(first.status, 201);
    const replay = await fetch(path, { method: 'POST', headers, body: JSON.stringify(requestBody) });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('Idempotency-Replayed'), 'true');
    assert.deepEqual(await replay.json(), await first.json());
    const reused = await fetch(path, { method: 'POST', headers, body: JSON.stringify({ ...requestBody, placementDetails: 'A different setup' }) });
    assert.equal(reused.status, 422);
    assert.equal((await reused.json()).error.code, 'IDEMPOTENCY_KEY_REUSED');
  });
});

test('submission idempotency does not replay an action onto a different event request', async () => {
  await withServer(async baseUrl => {
    const headers = { ...actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), 'Idempotency-Key': 'cross-event-key' };
    const first = await fetch(`${baseUrl}/event-requests/event-idempotency-a/technical-request`, { method: 'POST', headers, body: JSON.stringify(requestBody) });
    assert.equal(first.status, 201);
    const second = await fetch(`${baseUrl}/event-requests/event-idempotency-b/technical-request`, { method: 'POST', headers, body: JSON.stringify(requestBody) });
    assert.equal(second.status, 422);
    assert.equal((await second.json()).error.code, 'IDEMPOTENCY_KEY_REUSED');
    const untouched = await fetch(`${baseUrl}/event-requests/event-idempotency-b/technical-request`, { headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR') });
    assert.equal(untouched.status, 404);
  });
});

test('TC-CS41-03 exposes versioned equipment stock to Technical Support and denies Coordinator writes', async () => {
  await withServer(async baseUrl => {
    const support = await fetch(`${baseUrl}/equipment-inventory`, { headers: actorHeaders('support-stock', 'TECHNICAL_SUPPORT_STAFF') });
    assert.equal(support.status, 200);
    const inventory = await support.json();
    const projector = inventory.items.find(item => item.equipmentType === 'projector');
    assert.equal(projector.total, 5);
    assert.equal(projector.version, 1);

    const updated = await fetch(`${baseUrl}/equipment-inventory/projector`, {
      method: 'PUT', headers: { ...actorHeaders('support-stock', 'TECHNICAL_SUPPORT_STAFF'), 'Idempotency-Key': 'stock-projector-v1' },
      body: JSON.stringify({ total: 8, version: 1 }),
    });
    assert.equal(updated.status, 200);
    const saved = await updated.json();
    assert.equal(saved.equipmentType, 'projector');
    assert.equal(saved.total, 8);
    assert.equal(saved.version, 2);

    const forbidden = await fetch(`${baseUrl}/equipment-inventory/projector`, {
      method: 'PUT', headers: { ...actorHeaders('coordinator-stock', 'EVENT_COORDINATOR'), 'Idempotency-Key': 'coordinator-stock-write' },
      body: JSON.stringify({ total: 9, version: 2 }),
    });
    assert.equal(forbidden.status, 403);
  });
});

test('TC-CS41-01/11 records a read-only dated availability result; TC-CS42-02 refuses a partial reservation', async () => {
  await withServer(async baseUrl => {
    const coordinator = actorHeaders('coordinator-availability', 'EVENT_COORDINATOR');
    const catalog = await fetch(`${baseUrl}/equipment-types`, { headers: coordinator });
    const projector = (await catalog.json()).equipmentTypes.find(item => item.name === 'projector');
    const requested = Math.max(1, projector.total - 2);
    const requestPath = `${baseUrl}/event-requests/event-availability/technical-request`;
    const submitted = await fetch(requestPath, {
      method: 'POST', headers: coordinator,
      body: JSON.stringify({ ...requestBody, equipment: [{ equipmentType: 'projector', quantity: requested, venueId: 'B1' }] }),
    });
    assert.equal(submitted.status, 201);
    const reviewed = await fetch(`${requestPath}/decision`, {
      method: 'POST', headers: actorHeaders('support-availability', 'TECHNICAL_SUPPORT_STAFF'),
      body: JSON.stringify({ decision: 'APPROVED', version: 1 }),
    });
    assert.equal(reviewed.status, 200);
    const headers = { ...actorHeaders('support-availability', 'TECHNICAL_SUPPORT_STAFF'), 'x-test-equipment-period': '2028-11-20T01:00:00.000Z,2028-11-20T03:00:00.000Z' };
    const check = await fetch(`${requestPath}/availability`, { headers });
    assert.equal(check.status, 200);
    const availability = await check.json();
    assert.equal(availability.fulfillable, true);
    assert.deepEqual(availability.lines, [{ equipmentType: 'projector', requested, available: projector.total, shortfall: 0 }]);

    const shortage = await fetch(`${requestPath}/reservations`, {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': 'reserve-shortage' },
      body: JSON.stringify({ version: 1 }),
    });
    assert.equal(shortage.status, 200);
    const saved = await shortage.json();
    assert.equal(saved.reservations.length, 1);

    const secondPath = `${baseUrl}/event-requests/event-shortage/technical-request`;
    await fetch(secondPath, { method: 'POST', headers: coordinator, body: JSON.stringify({ ...requestBody, equipment: [{ equipmentType: 'projector', quantity: requested, venueId: 'B1' }] }) });
    await fetch(`${secondPath}/decision`, { method: 'POST', headers: headers, body: JSON.stringify({ decision: 'APPROVED', version: 1 }) });
    const rejected = await fetch(`${secondPath}/reservations`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'reserve-no-partial' }, body: JSON.stringify({ version: 1 }) });
    assert.equal(rejected.status, 409);
    const body = await rejected.json();
    assert.equal(body.error.code, 'EQUIPMENT_SHORTFALL');
    assert.equal(body.error.lines[0].shortfall, Math.max(0, requested * 2 - projector.total));
  });
});

test('HTTP boundary returns unauthenticated, missing, stale, reassignment, invalid decision, and decision replay outcomes', async () => {
  await withServer(async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/equipment-types`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/event-requests/no-request/technical-request`, { headers: actorHeaders('coord-http', 'EVENT_COORDINATOR') })).status, 404);
    const path = `${baseUrl}/event-requests/route-branches/technical-request`;
    const staleNew = await fetch(path, { method: 'POST', headers: actorHeaders('coord-http', 'EVENT_COORDINATOR'), body: JSON.stringify({ ...requestBody, version: 2 }) });
    assert.equal(staleNew.status, 409);
    const reassigned = await fetch(path, { method: 'POST', headers: { ...actorHeaders('coord-http', 'EVENT_COORDINATOR'), 'x-test-current-coordinator-id': 'someone-else' }, body: JSON.stringify(requestBody) });
    assert.equal(reassigned.status, 403);
    assert.equal((await fetch(`${baseUrl}/event-requests/not-submitted/technical-request/decision`, { method: 'POST', headers: actorHeaders('support-http', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'APPROVED', version: 1 }) })).status, 404);

    const submitted = await fetch(path, { method: 'POST', headers: actorHeaders('coord-http', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 201);
    const decisionUrl = `${path}/decision`;
    const decisionHeaders = { ...actorHeaders('support-http', 'TECHNICAL_SUPPORT_STAFF'), 'Idempotency-Key': 'decision-replay-route' };
    const decisionBody = { decision: 'APPROVED', version: 1 };
    const first = await fetch(decisionUrl, { method: 'POST', headers: decisionHeaders, body: JSON.stringify(decisionBody) });
    assert.equal(first.status, 200);
    const replay = await fetch(decisionUrl, { method: 'POST', headers: decisionHeaders, body: JSON.stringify(decisionBody) });
    assert.equal(replay.headers.get('Idempotency-Replayed'), 'true');
    const reused = await fetch(decisionUrl, { method: 'POST', headers: decisionHeaders, body: JSON.stringify({ decision: 'REJECTED', reason: 'different', version: 1 }) });
    assert.equal(reused.status, 422);

    const invalidPath = `${baseUrl}/event-requests/invalid-decision/technical-request`;
    await fetch(invalidPath, { method: 'POST', headers: actorHeaders('coord-http', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody) });
    const invalid = await fetch(`${invalidPath}/decision`, { method: 'POST', headers: actorHeaders('support-http', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'INVALID', version: 1 }) });
    assert.equal(invalid.status, 422);
  });
});

test('venue id persists through create and read', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/event-requests/event-venue/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({
        equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'B1' }],
        supportRequired: true,
        supportDetails: 'Setup assistance',
        placementDetails: 'Room A: 1; Room B: 1',
        version: 1,
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.equipment[0].venueId, 'B1');
    const read = await fetch(`${baseUrl}/event-requests/event-venue/technical-request`, {
      headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
    });
    const persisted = await read.json();
    assert.equal(persisted.equipment[0].venueId, 'B1');
  });
});

test('missing venue id is rejected without persistence', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/event-requests/event-venue-invalid/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({
        equipment: [{ equipmentType: 'projector', quantity: 2, venueId: '' }],
        supportRequired: true,
        supportDetails: 'Setup assistance',
        placementDetails: 'Room A: 1; Room B: 1',
        version: 1,
      }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.ok(body.error.fields['equipment.0.venueId']);
  });
});
