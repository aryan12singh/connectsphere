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
