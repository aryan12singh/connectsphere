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
  registrationWindow: { startAt: '2026-10-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' },
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
