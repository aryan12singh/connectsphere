const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');

test('memory store lists only confirmed events', async () => {
  const eventId = `store-event-${Date.now()}`;
  await store.saveEvent({
    id: `local-row-${eventId}`,
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

test('TC-CS48-11 duplicate and older EventConfirmed snapshots cannot roll back the local Event', async () => {
  const eventId = `confirmed-projection-${Date.now()}`;
  const base = {
    id: `local-row-${eventId}`,
    eventId,
    status: 'CONFIRMED',
    title: 'Version one',
    description: 'Attendee-safe details',
    startAt: '2026-11-01T00:00:00.000Z',
    endAt: '2026-11-01T02:00:00.000Z',
    timeZone: 'Asia/Singapore',
    organiserId: 'organiser-1',
    eventVersion: 1,
    registrationEnabled: true,
    registrationWindow: { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' },
  };

  await store.saveEvent({ ...base, eventVersion: 0, registrationLimit: 80 });
  await store.upsertConfirmedEvent(base);
  await store.saveRegistration({ eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: '2026-10-01T00:00:00.000Z' });
  await store.upsertConfirmedEvent({ ...base, title: 'Duplicate v1', registrationLimit: null });
  await store.upsertConfirmedEvent({ ...base, eventVersion: 3, title: 'Version three', registrationLimit: null });
  await store.upsertConfirmedEvent({ ...base, title: 'Late version one', registrationLimit: null });

  const saved = await store.findEvent(eventId);
  assert.equal(saved.eventVersion, 3);
  assert.equal(saved.title, 'Version three');
  assert.equal(saved.registrationLimit, 80);
  assert.equal(await store.findRegistration(eventId, 'attendee-1').then(Boolean), true);
  assert.equal((await store.listEvents()).filter(event => event.eventId === eventId).length, 1);
  assert.equal(saved.id, `local-row-${eventId}`);
});

test('TC-CS48-11 first EventConfirmed creates a local Event without creating a registration', async () => {
  const eventId = `confirmed-create-${Date.now()}`;
  const saved = await store.upsertConfirmedEvent({
    id: eventId,
    eventId,
    title: 'Newly confirmed',
    description: 'Public information',
    status: 'CONFIRMED',
    eventVersion: 1,
    startAt: '2026-11-01T00:00:00.000Z',
    endAt: '2026-11-01T02:00:00.000Z',
    timeZone: 'Asia/Singapore',
    organiserId: 'organiser-1',
    registrationEnabled: false,
    registrationWindow: null,
  });
  assert.equal(saved.eventId, eventId);
  assert.equal(saved.eventVersion, 1);
  assert.equal(await store.findRegistration(eventId, 'attendee-1'), null);
  assert.equal((await store.listEvents()).filter(event => event.eventId === eventId).length, 1);
});

test('TC-CS49-11 newer Event detail projections preserve confirmed and withdrawn registration records', async () => {
  const eventId = `cs49-projection-${Date.now()}`;
  const base = {
    id: eventId, eventId, title: 'Confirmed event', description: '', status: 'CONFIRMED', eventVersion: 1,
    startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-11-01T02:00:00.000Z', timeZone: 'Asia/Singapore',
    organiserId: 'organiser-1', registrationEnabled: true,
    registrationWindow: { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' },
  };
  await store.upsertConfirmedEvent(base);
  const confirmed = await store.saveRegistration({ eventId, userId: 'attendee-confirmed', status: 'CONFIRMED', registeredAt: '2026-10-01T00:00:00.000Z' });
  const withdrawn = await store.saveRegistration({ eventId, userId: 'attendee-withdrawn', status: 'WITHDRAWN', registeredAt: '2026-10-02T00:00:00.000Z', withdrawnAt: '2026-10-03T00:00:00.000Z' });
  await store.upsertConfirmedEvent({ ...base, eventVersion: 2, title: 'Rescheduled event', startAt: '2026-11-02T00:00:00.000Z' });
  const rows = await store.registrationsForEvent(eventId);
  assert.deepEqual(rows.map(row => [row.id, row.status, row.withdrawnAt ?? null]).sort(), [
    [confirmed.id, 'CONFIRMED', null],
    [withdrawn.id, 'WITHDRAWN', '2026-10-03T00:00:00.000Z'],
  ].sort());
  assert.equal((await store.findEvent(eventId)).title, 'Rescheduled event');
  assert.equal(store.listOutboxForTest().filter(action => action.aggregateId === eventId && action.type === 'RegistrationWithdrawn').length, 0);
  assert.equal(store.listOutboxForTest().filter(action => action.aggregateId === eventId && action.type === 'WaitlistOfferMade').length, 0);
});
