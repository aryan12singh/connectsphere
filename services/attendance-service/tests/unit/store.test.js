const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');

test('memory store lists only confirmed events', async () => {
  const eventId = `store-event-${Date.now()}`;
  await store.saveEvent({
    id: eventId,
    eventId,
    title: 'Test Event',
    description: 'A test event',
    status: 'CONFIRMED',
    startAt: '2026-11-01T00:00:00Z',
    endAt: '2026-11-01T02:00:00Z',
    timeZone: 'Asia/Singapore',
    primaryVenueId: 'v-1',
    primaryVenueName: 'Main Hall',
    registrationLimit: 100,
    registrationWindow: { startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-10T00:00:00Z' },
    venues: [{ id: 'v-1', name: 'Main Hall', status: 'CONFIRMED', approved: true }],
    organiserId: 'org-1',
  });
  await store.saveEvent({
    id: `store-event-${Date.now()}-2`,
    eventId: `store-event-${Date.now()}-2`,
    title: 'Draft Event',
    description: 'Not visible',
    status: 'DRAFT',
    startAt: '2026-11-01T00:00:00Z',
    endAt: '2026-11-01T02:00:00Z',
    timeZone: 'Asia/Singapore',
    primaryVenueId: 'v-1',
    primaryVenueName: 'Main Hall',
    registrationLimit: 50,
    registrationWindow: null,
    venues: [],
    organiserId: 'org-1',
  });

  const events = await store.listEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Test Event');
  assert.equal(events[0].status, 'CONFIRMED');
  assert.equal(events[0].primaryVenueName, 'Main Hall');
});

test('findEvent returns the stored event', async () => {
  const eventId = `store-find-${Date.now()}`;
  await store.saveEvent({
    id: eventId,
    eventId,
    title: 'Findable Event',
    description: 'Can be found',
    status: 'CONFIRMED',
    startAt: '2026-11-01T00:00:00Z',
    endAt: '2026-11-01T02:00:00Z',
    timeZone: 'Asia/Singapore',
    primaryVenueId: 'v-1',
    primaryVenueName: 'Hall A',
    registrationLimit: 50,
    registrationWindow: null,
    venues: [],
    organiserId: 'org-1',
  });
  const found = await store.findEvent(eventId);
  assert.ok(found);
  assert.equal(found.title, 'Findable Event');
  assert.equal(found.primaryVenueName, 'Hall A');
  assert.equal(await store.findEvent('nonexistent'), null);
});

test('saveRegistration stores and retrieves own registration', async () => {
  const eventId = `store-reg-${Date.now()}`;
  const registration = {
    eventId,
    userId: 'user-1',
    status: 'CONFIRMED',
    registeredAt: '2026-10-15T00:00:00Z',
  };
  const saved = await store.saveRegistration(registration);
  assert.equal(saved.userId, 'user-1');
  assert.equal(saved.status, 'CONFIRMED');
  const found = await store.findRegistration(eventId, 'user-1');
  assert.ok(found);
  assert.equal(found.userId, 'user-1');
  assert.equal(await store.findRegistration(eventId, 'user-2'), null);
});
