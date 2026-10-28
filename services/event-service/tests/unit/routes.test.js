process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'mock';
process.env.DATA_MODE = 'memory';
process.env.DATABASE_URL = 'postgresql://unused/unused';
process.env.INTERNAL_API_KEY = 'test-internal-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../../src/app');
const authModule = require('../../src/auth');
const { pickCoordinator, countsAsActive } = require('../../src/domain/assignment');
const { isOrganiser, isCoordinator, isLead, canRead, canEdit, canDecide, allowedActions } = require('../../src/policy');

async function withServer(run) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function auth(userId, role) {
  return { 'content-type': 'application/json', 'x-test-user-id': userId, 'x-test-role': role };
}

const validRequest = {
  eventName: 'Route contract test',
  purpose: 'Integration test',
  description: 'Created through the documented event-service route.',
  startAt: '2026-11-20T09:00:00+08:00',
  endAt: '2026-11-20T17:00:00+08:00',
  timeZone: 'Asia/Singapore',
  expectedAttendance: 200,
  minimumCapacity: 220,
  preferredLayout: 'theatre',
  venueType: 'physical',
  venueRequirements: 'Hall A',
  accessibilityNeeds: ['wheelchair'],
  accessibilityDetails: '',
  equipmentNeeds: ['projector'],
  technicalDetails: '',
};

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function requestHeaders(values = {}) {
  return { get(name) { return values[name.toLowerCase()] || values[name] || ''; } };
}

test('authentication and internal route guards cover denied, valid and unavailable paths', async () => {
  const unauthenticatedResponse = responseRecorder();
  await authModule.requireAuth()({ get: () => '' }, unauthenticatedResponse, () => {});
  assert.equal(unauthenticatedResponse.statusCode, 401);

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ valid: true, user: { id: 'bearer-user', role: 'EVENT_ORGANISER' }, permissions: ['event_requests.create'] }) });
    const bearerRequest = { get: requestHeaders({ authorization: 'Bearer session-token' }).get };
    let nextCalled = false;
    await authModule.requireAuth()(bearerRequest, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(bearerRequest.actor.id, 'bearer-user');

    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) }); // auth-service answers 401 for an unknown or expired token
    const invalidResponse = responseRecorder();
    await authModule.requireAuth()({ get: requestHeaders({ authorization: 'Bearer expired' }).get }, invalidResponse, () => {});
    assert.equal(invalidResponse.statusCode, 401);

    global.fetch = async () => { throw new Error('auth unavailable'); };
    const unavailableResponse = responseRecorder();
    const originalError = console.error;
    console.error = () => {};
    try {
      await authModule.requireAuth()({ get: requestHeaders({ authorization: 'Bearer unavailable' }).get }, unavailableResponse, () => {});
    } finally {
      console.error = originalError;
    }
    assert.equal(unavailableResponse.statusCode, 503);
  } finally {
    global.fetch = originalFetch;
  }

  const roleDenied = responseRecorder();
  authModule.requireRole('EVENT_COORDINATOR')({ actor: { role: 'EVENT_ORGANISER' } }, roleDenied, () => {});
  assert.equal(roleDenied.statusCode, 403);
  const roleAllowed = responseRecorder();
  let roleNext = false;
  authModule.requireRole('EVENT_COORDINATOR')({ actor: { role: 'EVENT_COORDINATOR' } }, roleAllowed, () => { roleNext = true; });
  assert.equal(roleNext, true);

  const internalDenied = responseRecorder();
  authModule.internalOnly({ get: () => 'wrong-key' }, internalDenied, () => {});
  assert.equal(internalDenied.statusCode, 403);
  let internalNext = false;
  authModule.internalOnly({ get: () => 'test-internal-key' }, responseRecorder(), () => { internalNext = true; });
  assert.equal(internalNext, true);
});

test('Prisma configuration branch can initialize the adapter without connecting', () => {
  const configPath = require.resolve('../../src/config');
  const dbPath = require.resolve('../../src/db');
  const envKeys = ['PORT', 'DATA_MODE', 'DATABASE_URL', 'AUTH_SERVICE_URL', 'USER_SERVICE_URL', 'INTERNAL_API_KEY', 'NODE_ENV'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      PORT: '3999', DATA_MODE: 'prisma', DATABASE_URL: 'postgresql://unused/unused',
      AUTH_SERVICE_URL: 'http://auth.example', USER_SERVICE_URL: 'http://users.example',
      INTERNAL_API_KEY: 'coverage-key', NODE_ENV: 'test',
    });
    delete require.cache[configPath];
    const configured = require('../../src/config');
    assert.equal(configured.port, 3999);
    assert.equal(configured.authServiceUrl, 'http://auth.example');
    assert.equal(configured.userServiceUrl, 'http://users.example');

    process.env.DATA_MODE = 'prisma';
    process.env.DATABASE_URL = 'postgresql://unused/unused';
    delete require.cache[dbPath];
    const prisma = require('../../src/db');
    assert.ok(prisma);
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    delete require.cache[configPath];
    delete require.cache[dbPath];
    require('../../src/db');
  }
});

test('app returns a consistent error response for malformed JSON', async () => {
  await withServer(async (baseUrl) => {
    const originalError = console.error;
    console.error = () => {};
    let response;
    try {
      response = await fetch(`${baseUrl}/event-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth('malformed-json-user', 'EVENT_ORGANISER') },
        body: '{not-json',
      });
    } finally {
      console.error = originalError;
    }
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'INTERNAL');
  });
});

test('app health and unknown routes return their documented envelopes', async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const missing = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  });
});

test('assignment policy handles active counts, ties and empty coordinator lists', () => {
  assert.equal(countsAsActive({ requestStatus: 'SUBMITTED' }), true);
  assert.equal(countsAsActive({ requestStatus: 'RETURNED_FOR_AMENDMENT' }), true);
  assert.equal(countsAsActive({ requestStatus: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING' }), true);
  assert.equal(countsAsActive({ requestStatus: 'APPROVED', eventStatus: 'CONFIRMED' }), true);
  assert.equal(countsAsActive({ requestStatus: 'APPROVED', eventStatus: 'CANCELLED' }), false);
  assert.equal(countsAsActive({ requestStatus: 'DRAFT' }), false);
  assert.equal(pickCoordinator([], {}), null);
  assert.equal(pickCoordinator([{ id: 'senior', createdAt: '2020-01-01' }, { id: 'junior', createdAt: '2025-01-01' }], { senior: 2 }), 'junior');
  assert.equal(pickCoordinator([{ id: 'z', createdAt: '2020-01-01' }, { id: 'a', createdAt: '2020-01-01' }], {}), 'a');
});

test('policy helpers cover owner, organisation, coordinator and disabled action branches', () => {
  const draft = { organiserId: 'org-1', organisationId: 'company-1', status: 'DRAFT', currentCoordinatorId: null };
  const returned = { ...draft, status: 'RETURNED_FOR_AMENDMENT' };
  const submitted = { ...draft, status: 'SUBMITTED', currentCoordinatorId: 'coord-1' };
  const unassigned = { ...draft, status: 'SUBMITTED' };
  const organiser = { role: 'EVENT_ORGANISER', id: 'org-1' };
  const sameCompany = { role: 'EVENT_ORGANISER', id: 'org-2', organisationId: 'company-1' };
  const coordinator = { role: 'EVENT_COORDINATOR', id: 'coord-1' };
  const otherCoordinator = { role: 'EVENT_COORDINATOR', id: 'coord-2' };
  const attendee = { role: 'ATTENDEE', id: 'attendee-1' };
  const lead = { role: 'EVENT_COORDINATOR_LEAD', id: 'lead-1', permissions: ['assignments.view', 'events.view'] };
  assert.equal(isOrganiser(organiser), true);
  assert.equal(isLead(lead), true);
  assert.equal(isLead(coordinator), false);
  assert.equal(isCoordinator(lead), false);
  assert.equal(isCoordinator(coordinator), true);
  assert.equal(canRead(organiser, draft), true);
  assert.equal(canRead(sameCompany, draft), false);
  assert.equal(canRead(coordinator, submitted), true);
  // Week 7: a Coordinator never sees a queued request; only the Lead does, until it is assigned.
  assert.equal(canRead(otherCoordinator, unassigned), false);
  assert.equal(canRead(lead, unassigned), true);
  assert.equal(canRead(lead, submitted), false);
  assert.equal(canRead(lead, draft), false);
  assert.equal(canRead(attendee, draft), false);
  assert.equal(canEdit(organiser, draft), true);
  assert.equal(canEdit(organiser, returned), true);
  assert.equal(canEdit(organiser, submitted), false);
  assert.equal(canDecide(coordinator, submitted), true);
  assert.equal(canDecide(otherCoordinator, submitted), false);
  assert.deepEqual(allowedActions(organiser, draft), ['edit', 'submit']);
  assert.deepEqual(allowedActions(organiser, returned), ['edit', 'resubmit']);
  // Nobody can decide an unassigned request, and a Coordinator can no longer claim or reassign.
  assert.deepEqual(allowedActions(coordinator, unassigned), []);
  assert.deepEqual(allowedActions(otherCoordinator, submitted), []);
  assert.deepEqual(allowedActions(coordinator, submitted), ['approve', 'reject', 'amendments']);
  assert.deepEqual(allowedActions(lead, unassigned), ['assign']);
  assert.deepEqual(allowedActions(lead, submitted), []);
  assert.deepEqual(allowedActions(lead, draft), []);
  assert.deepEqual(allowedActions(attendee, draft), []);
  // CS-12: Planning-stage Reject is offered only to the current Coordinator while the Event is still in Planning.
  const planning = { ...submitted, status: 'APPROVED', event: { id: 'e1', status: 'ARRANGEMENT_PENDING' } };
  assert.deepEqual(allowedActions(coordinator, planning), ['reject']);
  assert.deepEqual(allowedActions(otherCoordinator, planning), []);
  assert.deepEqual(allowedActions(coordinator, { ...planning, event: { id: 'e1', status: 'CONFIRMED' } }), []);
  assert.deepEqual(allowedActions(organiser, planning), []);
});

test('POST /event-requests creates a draft owned by the authenticated organiser', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-requests`, {
      method: 'POST',
      headers: auth('organiser-route-test', 'EVENT_ORGANISER'),
      body: JSON.stringify({ ...validRequest, status: 'DRAFT' }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.status, 'DRAFT');
    assert.equal(body.organiserId, 'organiser-route-test');
    assert.equal(body.eventName, validRequest.eventName);
    assert.equal(body.startAt, '2026-11-20T01:00:00.000Z');
    assert.equal(body.endAt, '2026-11-20T09:00:00.000Z');
  });
});

test('draft can be submitted with a version and then approved by its coordinator', async () => {
  await withServer(async (baseUrl) => {
    const organiser = auth('organiser-flow-test', 'EVENT_ORGANISER');
    const created = await fetch(`${baseUrl}/event-requests`, { method: 'POST', headers: organiser, body: JSON.stringify(validRequest) });
    const draft = await created.json();
    const submittedResponse = await fetch(`${baseUrl}/event-requests/${draft.id}/submit`, { method: 'POST', headers: organiser, body: JSON.stringify({ version: draft.version }) });
    assert.equal(submittedResponse.status, 200);
    const submitted = await submittedResponse.json();
    assert.equal(submitted.status, 'SUBMITTED');
    // Week 7: the submission stays unassigned, nobody can decide it, and only the Lead assigns.
    assert.equal(submitted.currentCoordinatorId, null);
    assert.equal(submitted.awaitingAssignment, true);
    const coordinator = auth('coord-flow-test', 'EVENT_COORDINATOR');
    const lead = auth('lead-flow-test', 'EVENT_COORDINATOR_LEAD');
    const early = await fetch(`${baseUrl}/event-requests/${draft.id}/decision`, { method: 'POST', headers: coordinator, body: JSON.stringify({ decision: 'approve', version: submitted.version }) });
    assert.equal(early.status, 403);
    const claim = await fetch(`${baseUrl}/event-requests/${draft.id}/assign`, { method: 'POST', headers: lead, body: JSON.stringify({ coordinatorId: 'coord-flow-test', version: submitted.version }) });
    assert.equal(claim.status, 200);
    const assigned = await claim.json();
    assert.equal(assigned.currentCoordinatorId, 'coord-flow-test');
    const approved = await fetch(`${baseUrl}/event-requests/${draft.id}/decision`, { method: 'POST', headers: coordinator, body: JSON.stringify({ decision: 'approve', version: assigned.version, notes: 'Ready' }) });
    assert.equal(approved.status, 200);
    const body = await approved.json();
    assert.equal(body.status, 'APPROVED');
    assert.equal(body.event.status, 'ARRANGEMENT_PENDING');
  });
});

test('OpenAPI route lifecycle combines validation, permissions, concurrency, decisions and visibility', async (t) => {
  await withServer(async (baseUrl) => {
    const organiser = auth('organiser-scenario', 'EVENT_ORGANISER');
    const coordinator = auth('coordinator-scenario', 'EVENT_COORDINATOR');
    const lead = auth('lead-scenario', 'EVENT_COORDINATOR_LEAD');
    const otherOrganiser = auth('other-organiser-scenario', 'EVENT_ORGANISER');
    const request = (method, path, headers, body) => fetch(`${baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await t.test('invalid complete submission returns field-level validation', async () => {
      const created = await request('POST', '/event-requests', organiser, { eventName: '' });
      const draft = await created.json();
      const response = await request('POST', `/event-requests/${draft.id}/submit`, organiser, { version: draft.version });
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'VALIDATION_FAILED');
    });

    const createdResponse = await request('POST', '/event-requests', organiser, validRequest);
    const draft = await createdResponse.json();
    await t.test('wrong actor cannot update another organiser request', async () => {
      const response = await request('PUT', `/event-requests/${draft.id}`, otherOrganiser, { ...validRequest, version: draft.version });
      assert.equal(response.status, 403);
    });

    const submittedResponse = await request('POST', `/event-requests/${draft.id}/submit`, organiser, { version: draft.version });
    const submitted = await submittedResponse.json();
    await t.test('stale version is rejected without mutating the request', async () => {
      const response = await request('POST', `/event-requests/${draft.id}/submit`, organiser, { version: draft.version });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'INVALID_TRANSITION');
    });

    const claimedResponse = await request('POST', `/event-requests/${draft.id}/assign`, lead, { coordinatorId: 'coordinator-scenario', version: submitted.version });
    const claimed = await claimedResponse.json();
    await t.test('mandatory reject reason is enforced by the transition guard', async () => {
      const response = await request('POST', `/event-requests/${draft.id}/decision`, coordinator, { decision: 'reject', version: claimed.version });
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'VALIDATION_FAILED');
    });

    const returnedResponse = await request('POST', `/event-requests/${draft.id}/decision`, coordinator, { decision: 'amendments', comments: 'Please add the budget.', version: claimed.version });
    const returned = await returnedResponse.json();
    await t.test('owner can edit and resubmit after amendments', async () => {
      const updatedResponse = await request('PUT', `/event-requests/${draft.id}`, organiser, { ...validRequest, version: returned.version });
      assert.equal(updatedResponse.status, 200);
      const updated = await updatedResponse.json();
      const resubmittedResponse = await request('POST', `/event-requests/${draft.id}/resubmit`, organiser, { version: updated.version });
      assert.equal(resubmittedResponse.status, 200);
      assert.equal((await resubmittedResponse.json()).status, 'SUBMITTED');
    });

    await t.test('request activity and owner visibility are available', async () => {
      const activity = await request('GET', `/event-requests/${draft.id}/activity`, organiser);
      assert.equal(activity.status, 200);
      assert.ok((await activity.json()).items.length >= 3);
      const forbidden = await request('GET', `/event-requests/${draft.id}`, otherOrganiser);
      assert.equal(forbidden.status, 403);
    });
  });
});

test('route cases cover capability checks, assignment, pagination, decisions and events', async (t) => {
  await withServer(async (baseUrl) => {
    const organiser = auth('route-cases-organiser', 'EVENT_ORGANISER');
    const coordinator = auth('route-cases-coordinator', 'EVENT_COORDINATOR');
    const lead = auth('route-cases-lead', 'EVENT_COORDINATOR_LEAD');
    const otherCoordinator = auth('route-cases-other-coordinator', 'EVENT_COORDINATOR');
    const attendee = auth('route-cases-attendee', 'ATTENDEE');
    const request = (method, path, headers, body) => fetch(`${baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await t.test('capability middleware protects organiser and coordinator routes', async () => {
      const create = await request('POST', '/event-requests', attendee, validRequest);
      assert.equal(create.status, 403);
      const queue = await request('GET', '/event-requests/review-queue', attendee);
      assert.equal(queue.status, 403);
      const events = await request('GET', '/events', attendee);
      assert.equal(events.status, 200);
    });

    await t.test('draft validation and idempotency are enforced at the route boundary', async () => {
      const created = await request('POST', '/event-requests', organiser, { eventName: 'Route draft' });
      assert.equal(created.status, 201);
      const draft = await created.json();
      const keyHeaders = { ...organiser, 'Idempotency-Key': 'route-case-key' };
      const first = await request('POST', '/event-requests', keyHeaders, validRequest);
      const replay = await request('POST', '/event-requests', keyHeaders, validRequest);
      assert.equal(first.status, 201);
      assert.equal(replay.status, 201);
      assert.equal((await first.json()).id, (await replay.json()).id);
      const reuse = await request('POST', '/event-requests', keyHeaders, { ...validRequest, eventName: 'Changed body' });
      assert.equal(reuse.status, 422);
      const invalidSubmit = await request('POST', `/event-requests/${draft.id}/submit`, organiser, { version: draft.version });
      assert.equal(invalidSubmit.status, 422);
    });

    const created = await request('POST', '/event-requests', organiser, validRequest);
    const draft = await created.json();
    const submittedResponse = await request('POST', `/event-requests/${draft.id}/submit`, organiser, { version: draft.version });
    const submitted = await submittedResponse.json();

    await t.test('queued requests are only in the Lead queue; only the Lead assigns', async () => {
      // A Coordinator never sees a queued request and cannot claim it.
      const coordinatorQueue = await request('GET', '/event-requests/review-queue?page=1&pageSize=100', coordinator);
      assert.equal(coordinatorQueue.status, 200);
      assert.ok(!(await coordinatorQueue.json()).items.some((item) => item.id === draft.id));
      assert.equal((await request('GET', '/event-requests/unassigned', coordinator)).status, 403);
      assert.equal((await request('GET', '/event-requests/unassigned', organiser)).status, 403);
      assert.equal((await request('POST', `/event-requests/${draft.id}/assign`, coordinator, { coordinatorId: 'route-cases-coordinator', version: submitted.version })).status, 403);
      assert.equal((await request('POST', `/event-requests/${draft.id}/reassign`, coordinator, { coordinatorId: 'route-cases-coordinator', version: submitted.version })).status, 403);
      // The Lead sees it, oldest first, with basic information only.
      const leadQueue = await request('GET', '/event-requests/unassigned?page=1&pageSize=100', lead);
      assert.equal(leadQueue.status, 200);
      const leadBody = await leadQueue.json();
      const queued = leadBody.items.find((item) => item.id === draft.id);
      assert.equal(queued.eventName, validRequest.eventName);
      assert.deepEqual(queued.allowedActions, ['assign']);
      assert.equal(queued.currentCoordinatorId, null);
      const times = leadBody.items.map((item) => new Date(item.submittedAt).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
      // The Lead can open the queued request read-only, but not change it.
      assert.equal((await request('GET', `/event-requests/${draft.id}`, lead)).status, 200);
      assert.equal((await request('PUT', `/event-requests/${draft.id}`, lead, { ...validRequest, version: submitted.version })).status, 403);
      // Assigning removes it from the queue.
      const assign = await request('POST', `/event-requests/${draft.id}/assign`, lead, { coordinatorId: 'route-cases-coordinator', version: submitted.version });
      assert.equal(assign.status, 200);
      assert.equal((await assign.json()).currentCoordinatorId, 'route-cases-coordinator');
      assert.ok(!(await (await request('GET', '/event-requests/unassigned?page=1&pageSize=100', lead)).json()).items.some((item) => item.id === draft.id));
      // Assigning again is refused, and the Lead can see it under "assigned by me".
      assert.equal((await request('POST', `/event-requests/${draft.id}/assign`, lead, { coordinatorId: 'route-cases-other-coordinator', version: submitted.version + 1 })).status, 409);
      const mine = await (await request('GET', '/event-requests/assigned-by-me?page=1&pageSize=100', lead)).json();
      assert.deepEqual(mine.items.find((item) => item.id === draft.id)?.allowedActions, ['reassign']);
    });

    const assignedResponse = await request('GET', `/event-requests/${draft.id}`, coordinator);
    const assigned = await assignedResponse.json();
    await t.test('former coordinator loses decision access after reassignment', async () => {
      assert.equal((await request('POST', `/event-requests/${draft.id}/reassign`, coordinator, { coordinatorId: 'route-cases-other-coordinator', version: assigned.version })).status, 403);
      const reassigned = await request('POST', `/event-requests/${draft.id}/reassign`, lead, { coordinatorId: 'route-cases-other-coordinator', version: assigned.version });
      assert.equal(reassigned.status, 200);
      const record = await reassigned.json();
      const oldCoordinator = await request('POST', `/event-requests/${draft.id}/decision`, coordinator, { decision: 'approve', version: record.version });
      assert.equal(oldCoordinator.status, 403);
    });

    const current = await request('GET', `/event-requests/${draft.id}`, otherCoordinator);
    const currentRecord = await current.json();
    const approved = await request('POST', `/event-requests/${draft.id}/decision`, otherCoordinator, { decision: 'approve', notes: 'Approved by route case', version: currentRecord.version });
    assert.equal(approved.status, 200);
    const approvedRecord = await approved.json();

    await t.test('approval creates a Planning event and event routes enforce visibility', async () => {
      assert.equal(approvedRecord.status, 'APPROVED');
      assert.equal(approvedRecord.event.status, 'ARRANGEMENT_PENDING');
      const assignedQueue = await request('GET', '/event-requests/review-queue?assigned=me&page=1&pageSize=100', otherCoordinator);
      assert.equal(assignedQueue.status, 200);
      const assignedQueueBody = await assignedQueue.json();
      const retained = assignedQueueBody.items.find((item) => item.id === approvedRecord.id);
      assert.equal(retained?.status, 'APPROVED');
      const list = await request('GET', '/events?page=1&pageSize=100', organiser);
      assert.equal(list.status, 200);
      const events = await list.json();
      assert.ok(events.items.some((item) => item.id === approvedRecord.event.id));
      const event = await request('GET', `/events/${approvedRecord.event.id}`, organiser);
      assert.equal(event.status, 200);
      const bookingAccess = await request('GET', `/events/${approvedRecord.event.id}/booking-access`, otherCoordinator);
      assert.equal(bookingAccess.status, 200);
      assert.deepEqual(await bookingAccess.json(), { id: approvedRecord.event.id });
      const unassignedAccess = await request('GET', `/events/${approvedRecord.event.id}/booking-access`, coordinator);
      assert.equal(unassignedAccess.status, 403);
      const hidden = await request('GET', `/events/${approvedRecord.event.id}`, attendee);
      assert.equal(hidden.status, 403);
    });

    await t.test('rejected requests remain in the assigned queue with their new status', async () => {
      const createdResponse = await request('POST', '/event-requests', organiser, { ...validRequest, eventName: 'Route rejected request' });
      assert.equal(createdResponse.status, 201);
      const createdRecord = await createdResponse.json();
      const submitted = await request('POST', `/event-requests/${createdRecord.id}/submit`, organiser, { version: createdRecord.version });
      const submittedRecord = await submitted.json();
      const claimed = await request('POST', `/event-requests/${createdRecord.id}/assign`, lead, { coordinatorId: 'route-cases-other-coordinator', version: submittedRecord.version });
      assert.equal(claimed.status, 200);
      const claimedRecord = await claimed.json();
      const rejected = await request('POST', `/event-requests/${createdRecord.id}/decision`, otherCoordinator, { decision: 'reject', reason: 'Route case rejection', version: claimedRecord.version });
      assert.equal(rejected.status, 200);
      const rejectedRecord = await rejected.json();
      assert.equal(rejectedRecord.status, 'REJECTED');
      const assignedQueue = await request('GET', '/event-requests/review-queue?assigned=me&page=1&pageSize=100', otherCoordinator);
      const assignedQueueBody = await assignedQueue.json();
      assert.equal(assignedQueueBody.items.find((item) => item.id === createdRecord.id)?.status, 'REJECTED');
    });
  });
});

test('CS-41 Technical Support reads minimum event metadata without events.view', async () => {
  await withServer(async (baseUrl) => {
    const organiser = auth('technical-metadata-organiser', 'EVENT_ORGANISER');
    const coordinator = auth('technical-metadata-coordinator', 'EVENT_COORDINATOR');
    const lead = auth('technical-metadata-lead', 'EVENT_COORDINATOR_LEAD');
    const support = auth('technical-metadata-support', 'TECHNICAL_SUPPORT_STAFF');
    const createdResponse = await fetch(`${baseUrl}/event-requests`, {
      method: 'POST', headers: organiser, body: JSON.stringify(validRequest),
    });
    assert.equal(createdResponse.status, 201);
    const draft = await createdResponse.json();
    const submittedResponse = await fetch(`${baseUrl}/event-requests/${draft.id}/submit`, {
      method: 'POST', headers: organiser, body: JSON.stringify({ version: draft.version }),
    });
    assert.equal(submittedResponse.status, 200);
    const submitted = await submittedResponse.json();
    const claimedResponse = await fetch(`${baseUrl}/event-requests/${draft.id}/assign`, {
      method: 'POST', headers: lead,
      body: JSON.stringify({ coordinatorId: 'technical-metadata-coordinator', version: submitted.version }),
    });
    assert.equal(claimedResponse.status, 200);

    const path = `${baseUrl}/event-requests/technical-metadata?ids=${encodeURIComponent(draft.id)}`;
    const metadataResponse = await fetch(path, { headers: support });
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.deepEqual(metadata.items, [{
      eventRequestId: draft.id,
      title: validRequest.eventName,
      startAt: '2026-11-20T01:00:00.000Z',
      endAt: '2026-11-20T09:00:00.000Z',
      timeZone: 'Asia/Singapore',
      submitter: { id: 'technical-metadata-coordinator', name: 'technical-metadata-coordinator' },
    }]);
    assert.equal('submittedAt' in metadata.items[0], false);
    assert.equal((await fetch(path, { headers: coordinator })).status, 403);
  });
});
