const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATA_MODE = 'memory';
process.env.NODE_ENV = 'test';

const app = require('../../src/app');
const registrationWindowStart = new Date(Date.now() - 60 * 60_000).toISOString();
const registrationWindowEnd = new Date(Date.now() + 60 * 60_000).toISOString();

async function withServer(run) {
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await run(baseUrl);
  }
  finally { server.close(); }
}

function actorHeaders(id, role, eventAccess = '') {
  return { 'x-test-user-id': id, 'x-test-role': role, 'x-test-event-access': eventAccess };
}

const confirmedEvent = {
  id: 'event-confirmed-1',
  eventId: 'event-confirmed-1',
  title: 'Spring Gala',
  description: 'Annual gala dinner',
  status: 'CONFIRMED',
  startAt: '2026-11-15T10:00:00Z',
  endAt: '2026-11-15T14:00:00Z',
  timeZone: 'Asia/Singapore',
  primaryVenueId: 'venue-main',
  primaryVenueName: 'Main Ballroom',
  registrationLimit: 150,
  registrationEnabled: true,
  registrationWindow: { startAt: registrationWindowStart, endAt: registrationWindowEnd },
  venues: [{ id: 'venue-main', name: 'Main Ballroom', status: 'CONFIRMED', approved: true }],
  organiserId: 'org-1',
};

const draftEvent = {
  ...confirmedEvent,
  id: 'event-draft-1',
  eventId: 'event-draft-1',
  title: 'Draft Gala',
  status: 'DRAFT',
};

test('GET /attendances/events lists only confirmed events', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    await storeSave(draftEvent);
    const response = await fetch(`${baseUrl}/events`, { headers: actorHeaders('attendee-1', 'ATTENDEE') });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].title, 'Spring Gala');
  });
});

test('GET /attendances/events/:id returns attendee view with private fields removed', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    const response = await fetch(`${baseUrl}/events/${confirmedEvent.id}`, {
      headers: actorHeaders('attendee-1', 'ATTENDEE'),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.title, 'Spring Gala');
    assert.equal(body.description, 'Annual gala dinner');
    assert.equal(body.primaryVenueName, 'Main Ballroom');
    assert.equal(body.registrationLimit, 150);
    assert.ok(body.registrationWindow);
    assert.equal(body.internalNotes, undefined);
    assert.equal(body.planningData, undefined);
    assert.equal(body.safetyReviews, undefined);
    assert.equal(body.historicalArrangements, undefined);
    assert.equal(body.otherUserRegistrations, undefined);
    assert.equal(body.venueBookings, undefined);
  });
});

test('GET /attendances/events/:id returns 404 for non-confirmed event', async () => {
  await withServer(async baseUrl => {
    await storeSave(draftEvent);
    const response = await fetch(`${baseUrl}/events/${draftEvent.id}`, {
      headers: actorHeaders('attendee-1', 'ATTENDEE'),
    });
    assert.equal(response.status, 404);
  });
});

test('GET /attendances/events/:id/organiser returns all venues for organiser', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    const response = await fetch(`${baseUrl}/events/${confirmedEvent.id}/organiser`, {
      headers: actorHeaders('org-1', 'EVENT_ORGANISER'),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.title, 'Spring Gala');
    assert.ok(body.venues);
    assert.equal(body.venues.length, 1);
    assert.equal(body.internalNotes, undefined);
  });
});

test('GET /attendances/events/:id/organiser denies non-organiser', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    const response = await fetch(`${baseUrl}/events/${confirmedEvent.id}/organiser`, {
      headers: actorHeaders('attendee-1', 'ATTENDEE'),
    });
    assert.equal(response.status, 403);
  });
});

test('GET /attendances/registrations/:eventId returns own registration', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    await storeSaveRegistration({ eventId: confirmedEvent.id, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: '2026-10-15T00:00:00Z' });
    const response = await fetch(`${baseUrl}/registrations/${confirmedEvent.id}`, {
      headers: actorHeaders('attendee-1', 'ATTENDEE'),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.userId, 'attendee-1');
    assert.equal(body.status, 'CONFIRMED');
  });
});

test('GET /attendances/registrations/:eventId denies other user (privacy-protecting 404)', async () => {
  await withServer(async baseUrl => {
    await storeSave(confirmedEvent);
    await storeSaveRegistration({ eventId: confirmedEvent.id, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: '2026-10-15T00:00:00Z' });
    const response = await fetch(`${baseUrl}/registrations/${confirmedEvent.id}`, {
      headers: actorHeaders('attendee-2', 'ATTENDEE'),
    });
    assert.equal(response.status, 404);
  });
});

async function storeSave(event) {
  const { saveEvent } = require('../../src/store');
  await saveEvent(event);
}

async function storeSaveRegistration(registration) {
  const { saveRegistration } = require('../../src/store');
  await saveRegistration(registration);
}

test('Attendance public detail is sanitized for every role and Organiser-only detail requires the current Event owner',async()=>{
 await withServer(async baseUrl=>{
  await storeSave({...confirmedEvent,internalNotes:'Private operational detail',safetyReviews:[{privateNotes:'Private Safety assessment'}],venues:[{id:'venue-main',name:'Main Ballroom',internalNotes:'Private room access code'}]});
  for(const actor of [['org-1','EVENT_ORGANISER'],['unrelated-owner','EVENT_ORGANISER'],['attendee-1','ATTENDEE']]){
   const response=await fetch(`${baseUrl}/events/${confirmedEvent.id}`,{headers:actorHeaders(...actor)});assert.equal(response.status,200);const body=await response.json();assert.equal(body.internalNotes,undefined);assert.equal(body.safetyReviews,undefined);assert.deepEqual(body.venues,[{id:'venue-main',name:'Main Ballroom'}]);
  }
  assert.equal((await fetch(`${baseUrl}/events/${confirmedEvent.id}/organiser`,{headers:actorHeaders('unrelated-owner','EVENT_ORGANISER')})).status,403);
  const own=await fetch(`${baseUrl}/events/${confirmedEvent.id}/organiser`,{headers:actorHeaders('org-1','EVENT_ORGANISER')});assert.equal(own.status,200);const body=await own.json();assert.equal(body.internalNotes,undefined);assert.equal(body.safetyReviews,undefined);assert.deepEqual(body.venues,[{id:'venue-main',name:'Main Ballroom'}]);
 });
});

test('Attendance public Event writes cannot alter an actual Event or its saved registration policy',async()=>{
 await withServer(async baseUrl=>{
  await storeSave(confirmedEvent);
  for(const actor of [['attendee-1','ATTENDEE'],['unrelated-owner','EVENT_ORGANISER'],['org-1','EVENT_ORGANISER']]){
   const response=await fetch(`${baseUrl}/events`,{method:'POST',headers:{...actorHeaders(...actor),'content-type':'application/json'},body:JSON.stringify({...confirmedEvent,title:'Forged public update',registrationLimit:99999})});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET');
  }
  const saved=await require('../../src/store').findEvent(confirmedEvent.id);assert.equal(saved.title,confirmedEvent.title);assert.equal(saved.registrationLimit,150);
 });
});

test('Final change recipient contract includes registered, waitlisted and offered, skips withdrawn, expired, rejected and unrelated registrations, and requires the internal key',async()=>{
 await withServer(async baseUrl=>{
  const eventId='recipient-contract-event';await storeSave({...confirmedEvent,id:eventId,eventId});
  for(const [userId,status] of [['confirmed-user','CONFIRMED'],['waitlisted-user','WAITLISTED'],['offered-user','OFFERED'],['withdrawn-user','WITHDRAWN'],['expired-user','EXPIRED'],['rejected-user','REJECTED'],['pending-user','PENDING']])await storeSaveRegistration({eventId,userId,status,registeredAt:'2026-10-15T00:00:00Z'});
  await storeSaveRegistration({eventId:'another-event',userId:'unrelated-user',status:'CONFIRMED',registeredAt:'2026-10-15T00:00:00Z'});
  const path=`${baseUrl}/internal/events/${eventId}/notification-recipients`;assert.equal((await fetch(path)).status,401);
  const response=await fetch(path,{headers:{'x-internal-api-key':require('../../src/config').internalApiKey}});assert.equal(response.status,200);assert.deepEqual((await response.json()).items.sort(),['confirmed-user','offered-user','waitlisted-user']);
  assert.equal((await require('../../src/store').findRegistration(eventId,'withdrawn-user')).status,'WITHDRAWN');
 });
});

test('TC-CS48-01 attendee POST creates one registration and one RegistrationCreated action', async () => {
  await withServer(async baseUrl => {
    const eventId = `reg-create-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, registrationLimit: 2 });
    const response = await fetch(`${baseUrl}/events/${eventId}/registrations`, {
      method: 'POST', headers: { ...actorHeaders('attendee-new', 'ATTENDEE'), 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.registration.status, 'CONFIRMED');
    assert.equal(body.placesRemaining, 1);
    assert.equal((await require('../../src/store').findRegistration(eventId, 'attendee-new')).status, 'CONFIRMED');
    const actions = require('../../src/store').listOutboxForTest().filter(action => action.aggregateId === eventId);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'RegistrationCreated');
    assert.equal(actions[0].payload.userId, 'attendee-new');
    assert.ok(actions[0].id);
  });
});

test('TC-CS48-05 full capacity and duplicate registrations do not create extra rows or actions', async () => {
  await withServer(async baseUrl => {
    const eventId = `reg-full-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, registrationLimit: 1 });
    const register = userId => fetch(`${baseUrl}/events/${eventId}/registrations`, {
      method: 'POST', headers: { ...actorHeaders(userId, 'ATTENDEE'), 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal((await register('first-attendee')).status, 201);
    assert.equal((await register('first-attendee')).status, 409);
    const full = await register('second-attendee');
    assert.equal(full.status, 409);
    assert.equal((await full.json()).error.code, 'EVENT_FULL');
    assert.equal((await require('../../src/store').registrationsForEvent(eventId)).length, 1);
    assert.equal(require('../../src/store').listOutboxForTest().filter(a => a.aggregateId === eventId).length, 1);
  });
});

test('TC-CS48-04 registration POST fails closed for disabled, unconfirmed, missing-limit, and closed-window events', async () => {
  await withServer(async baseUrl => {
    const forbidden = await fetch(`${baseUrl}/events/${confirmedEvent.id}/registrations`, {
      method: 'POST', headers: { ...actorHeaders('org-1', 'EVENT_ORGANISER'), 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');
    const missing = await fetch(`${baseUrl}/events/missing-event/registrations`, {
      method: 'POST', headers: { ...actorHeaders('attendee-missing', 'ATTENDEE'), 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
    const cases = [
      [{ ...confirmedEvent, registrationEnabled: false }, 'REGISTRATION_DISABLED'],
      [{ ...confirmedEvent, status: 'CANCELLED' }, 'EVENT_NOT_CONFIRMED'],
      [{ ...confirmedEvent, registrationLimit: null }, 'REGISTRATION_LIMIT_UNSET'],
      [{ ...confirmedEvent, registrationWindow: { startAt: '2026-12-01T00:00:00Z', endAt: '2026-12-02T00:00:00Z' } }, 'REGISTRATION_NOT_OPEN'],
    ];
    for (const [index, [event, code]] of cases.entries()) {
      const eventId = `reg-ineligible-${Date.now()}-${index}`;
      await storeSave({ ...event, id: eventId, eventId });
      const response = await fetch(`${baseUrl}/events/${eventId}/registrations`, {
        method: 'POST', headers: { ...actorHeaders(`attendee-${index}`, 'ATTENDEE'), 'content-type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, code);
      assert.equal(await require('../../src/store').findRegistration(eventId, `attendee-${index}`), null);
    }
  });
});

test('TC-CS48-06 attendee can list only their own persisted registrations', async () => {
  await withServer(async baseUrl => {
    const eventId = `my-reg-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId });
    await storeSaveRegistration({ eventId, userId: 'mine', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    await storeSaveRegistration({ eventId, userId: 'other', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    const response = await fetch(`${baseUrl}/registrations`, { headers: actorHeaders('mine', 'ATTENDEE') });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.registrations.map(row => row.userId), ['mine']);
    const forbidden = await fetch(`${baseUrl}/registrations`, { headers: actorHeaders('org-1', 'EVENT_ORGANISER') });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');
  });
});

test('TC-CS48-07 management list is restricted to the Event Organiser and current Coordinator', async () => {
  await withServer(async baseUrl => {
    const eventId = `managed-reg-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, currentCoordinatorId: 'coord-1' });
    await storeSaveRegistration({ eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    const endpoint = `${baseUrl}/events/${eventId}/registrations`;
    assert.equal((await fetch(endpoint, { headers: actorHeaders('org-1', 'EVENT_ORGANISER') })).status, 200);
    assert.equal((await fetch(endpoint, { headers: actorHeaders('coord-1', 'EVENT_COORDINATOR') })).status, 200);
    assert.equal((await fetch(endpoint, { headers: actorHeaders('coord-old', 'EVENT_COORDINATOR') })).status, 403);
    assert.equal((await fetch(endpoint, { headers: actorHeaders('attendee-1', 'ATTENDEE') })).status, 403);
    assert.equal((await fetch(`${baseUrl}/events/missing-event/registrations`, { headers: actorHeaders('coord-1', 'EVENT_COORDINATOR') })).status, 404);
  });
});

test('TC-CS48-02 current Coordinator can set a positive registration limit but other actors cannot', async () => {
  await withServer(async baseUrl => {
    const eventId = `limit-edit-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, currentCoordinatorId: 'coord-1', registrationLimit: 20 });
    const endpoint = `${baseUrl}/events/${eventId}/registration-limit`;
    const body = JSON.stringify({ registrationLimit: 7 });
    const denied = await fetch(endpoint, { method: 'PUT', headers: { ...actorHeaders('coord-old', 'EVENT_COORDINATOR'), 'content-type': 'application/json' }, body });
    assert.equal(denied.status, 403);
    for (const registrationLimit of [0, 1.5]) {
      const invalid = await fetch(endpoint, {
        method: 'PUT', headers: { ...actorHeaders('coord-1', 'EVENT_COORDINATOR'), 'content-type': 'application/json' },
        body: JSON.stringify({ registrationLimit }),
      });
      assert.equal(invalid.status, 422);
      assert.equal((await invalid.json()).error.code, 'VALIDATION_FAILED');
    }
    const response = await fetch(endpoint, { method: 'PUT', headers: { ...actorHeaders('coord-1', 'EVENT_COORDINATOR'), 'content-type': 'application/json' }, body });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).registrationLimit, 7);
    const saved = await require('../../src/store').findEvent(eventId);
    assert.equal(saved.registrationLimit, 7);
  });
});

test('TC-CS48-05 reducing the limit below existing registrations retains them and closes new registration', async () => {
  await withServer(async baseUrl => {
    const eventId = `limit-reduction-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, currentCoordinatorId: 'coord-1', registrationLimit: 3 });
    await storeSaveRegistration({ eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    await storeSaveRegistration({ eventId, userId: 'attendee-2', status: 'CONFIRMED', registeredAt: new Date().toISOString() });

    const limitResponse = await fetch(`${baseUrl}/events/${eventId}/registration-limit`, {
      method: 'PUT', headers: { ...actorHeaders('coord-1', 'EVENT_COORDINATOR'), 'content-type': 'application/json' },
      body: JSON.stringify({ registrationLimit: 1 }),
    });
    assert.equal(limitResponse.status, 200);
    assert.deepEqual(await limitResponse.json(), {
      registrationLimit: 1, confirmedRegistrationCount: 2, placesRemaining: 0, overCapacity: true,
    });

    const registerResponse = await fetch(`${baseUrl}/events/${eventId}/registrations`, {
      method: 'POST', headers: { ...actorHeaders('attendee-3', 'ATTENDEE'), 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(registerResponse.status, 409);
    assert.equal((await registerResponse.json()).error.code, 'EVENT_FULL');
    assert.equal((await require('../../src/store').registrationsForEvent(eventId)).length, 2);
    assert.equal(require('../../src/store').listOutboxForTest().filter(row => row.aggregateId === eventId).length, 0);
  });
});

test('TC-CS49-01 and TC-CS49-05 Attendee withdrawal retains the row, reopens one place, and replays one durable action', async () => {
  await withServer(async baseUrl => {
    const eventId = `withdraw-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, registrationLimit: 1, withdrawalEnabled: true, withdrawalCutoffAt: new Date(Date.now() + 60_000).toISOString() });
    await storeSaveRegistration({ id: `registration-${eventId}`, eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    const registration = await require('../../src/store').findRegistration(eventId, 'attendee-1');
    const path = `${baseUrl}/registrations/${registration.id}/withdraw`;
    const headers = { ...actorHeaders('attendee-1', 'ATTENDEE'), 'content-type': 'application/json' };
    const first = await fetch(path, { method: 'POST', headers, body: '{}' });
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.registration.status, 'WITHDRAWN');
    assert.ok(result.registration.withdrawnAt);
    assert.equal(result.placesRemaining, 1);
    const replay = await fetch(path, { method: 'POST', headers, body: '{}' });
    assert.equal(replay.status, 200);
    assert.deepEqual((await replay.json()).registration, result.registration);
    const rows = await require('../../src/store').registrationsForEvent(eventId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'WITHDRAWN');
    const actions = require('../../src/store').listOutboxForTest().filter(row => row.aggregateId === eventId);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'RegistrationWithdrawn');
    assert.equal(actions[0].payload.registrationId, registration.id);
  });
});

test('TC-CS49-04 another Attendee and the Organiser cannot withdraw someone else’s registration', async () => {
  await withServer(async baseUrl => {
    const eventId = `withdraw-owner-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, withdrawalEnabled: true, withdrawalCutoffAt: new Date(Date.now() + 60_000).toISOString() });
    await storeSaveRegistration({ id: `registration-${eventId}`, eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date().toISOString() });
    const registration = await require('../../src/store').findRegistration(eventId, 'attendee-1');
    const path = `${baseUrl}/registrations/${registration.id}/withdraw`;
    for (const [id, role] of [['attendee-2', 'ATTENDEE'], ['org-1', 'EVENT_ORGANISER']]) {
      const denied = await fetch(path, { method: 'POST', headers: { ...actorHeaders(id, role), 'content-type': 'application/json' }, body: '{}' });
      assert.equal(denied.status, 403);
    }
    assert.equal((await require('../../src/store').findRegistration(eventId, 'attendee-1')).status, 'CONFIRMED');
    assert.equal(require('../../src/store').listOutboxForTest().filter(row => row.aggregateId === eventId).length, 0);
  });
});

test('TC-CS49-10 Organiser configures withdrawal policy and non-owners cannot change it', async () => {
  await withServer(async baseUrl => {
    const eventId = `withdraw-policy-${Date.now()}`;
    await storeSave({ ...confirmedEvent, id: eventId, eventId, organiserId: 'org-1' });
    const path = `${baseUrl}/events/${eventId}/withdrawal-policy`;
    const body = JSON.stringify({ withdrawalEnabled: true, withdrawalCutoffAt: '2026-11-08T15:59:59.000Z', allowReregistration: true });
    const denied = await fetch(path, { method: 'PUT', headers: { ...actorHeaders('org-2', 'EVENT_ORGANISER'), 'content-type': 'application/json' }, body });
    assert.equal(denied.status, 403);
    const saved = await fetch(path, { method: 'PUT', headers: { ...actorHeaders('org-1', 'EVENT_ORGANISER'), 'content-type': 'application/json' }, body });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { withdrawalEnabled: true, withdrawalCutoffAt: '2026-11-08T15:59:59.000Z', allowReregistration: true });
  });
});

test('TC-CS49-06 re-registration is governed by the Event Organiser setting and keeps the withdrawn audit row', async () => {
  const store = require('../../src/store');
  const closedId = `reregister-closed-${Date.now()}`;
  const openId = `reregister-open-${Date.now()}`;
  const oldRegistration = id => ({ id: `withdrawn-${id}`, eventId: id, userId: 'attendee-reregister', status: 'WITHDRAWN', registeredAt: new Date(Date.now() - 1000).toISOString(), withdrawnAt: new Date(Date.now() - 500).toISOString() });
  await storeSave({ ...confirmedEvent, id: closedId, eventId: closedId, allowReregistration: false });
  await storeSaveRegistration(oldRegistration(closedId));
  await assert.rejects(() => store.createRegistration(closedId, 'attendee-reregister'), error => error.code === 'ALREADY_EXISTS');

  await storeSave({ ...confirmedEvent, id: openId, eventId: openId, allowReregistration: true });
  const withdrawn = oldRegistration(openId);
  await storeSaveRegistration(withdrawn);
  const result = await store.createRegistration(openId, 'attendee-reregister');
  const rows = await store.registrationsForEvent(openId);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.status === 'WITHDRAWN')?.withdrawnAt, withdrawn.withdrawnAt);
  assert.equal(rows.filter(row => row.status === 'CONFIRMED').length, 1);
  assert.equal(result.registration.status, 'CONFIRMED');
});
