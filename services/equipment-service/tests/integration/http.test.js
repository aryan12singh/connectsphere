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
  equipment: [{ equipmentType: 'projector', quantity: 2 }],
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
    assert.equal(body.status, 'SUBMITTED');
    assert.equal(body.equipment[0].quantity, 2);
    const read = await fetch(`${baseUrl}/event-requests/event-1/technical-request`, {
      headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
    });
    const persisted = await read.json();
    assert.equal(persisted.version, 1);
    assert.equal(persisted.status, 'SUBMITTED');
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

test('TC-CS40-05 and TC-CS40-06 expose equipment catalog, accept support-only and explicit no-requirements requests', async () => {
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
    assert.equal(savedSupport.status, 'SUBMITTED');

    const noRequirements = await fetch(`${baseUrl}/event-requests/event-no-requirements/technical-request`, {
      method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'),
      body: JSON.stringify({ ...requestBody, equipment: [], supportRequired: false, notRequired: true }),
    });
    assert.equal(noRequirements.status, 201);
    assert.equal((await noRequirements.json()).notRequired, true);

    const queue = await fetch(`${baseUrl}/technical-requests`, { headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF') });
    const requests = (await queue.json()).requests;
    assert.ok(requests.some(item => item.eventRequestId === 'event-support-only'));
    assert.ok(requests.some(item => item.eventRequestId === 'event-no-requirements'));
  });
});

test('TC-CS40-07 prevents stale Technical Support decisions after a Coordinator updates requirements', async () => {
  await withServer(async baseUrl => {
    const path = `${baseUrl}/event-requests/event-stale/technical-request`;
    const submitted = await fetch(path, { method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify(requestBody) });
    assert.equal(submitted.status, 201);
    const updated = await fetch(path, { method: 'POST', headers: actorHeaders('coordinator-1', 'EVENT_COORDINATOR'), body: JSON.stringify({ ...requestBody, version: 1, equipment: [{ equipmentType: 'projector', quantity: 3 }] }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).version, 2);
    const stale = await fetch(`${path}/decision`, { method: 'POST', headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF'), body: JSON.stringify({ decision: 'APPROVED', version: 1 }) });
    assert.equal(stale.status, 409);
    const current = await fetch(path, { headers: actorHeaders('support-1', 'TECHNICAL_SUPPORT_STAFF') });
    assert.equal((await current.json()).status, 'SUBMITTED');
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
