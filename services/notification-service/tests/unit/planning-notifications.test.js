// CS-51 unit tests: planning decisions and staff action notices.
// Producers for these messages belong to other stories, so these use
// sample ("controlled") messages, which the CS-51 card allows for
// notification-contract evidence. Test IDs follow the PO's sprint sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');
const config = require('../../src/config');
const { deliver } = require('../../src/deliver');

config.retryDelayMs = 0;
const staff = { VENUE_STAFF: ['vs1', 'vs2'], TECHNICAL_SUPPORT_STAFF: ['ts1'] };
const lookups = { names: async () => 'Casey One', usersWithRole: async (role) => staff[role] || [] };
const send = (type, payload, id = `m-${type}`) => deliver({
  id, type, aggregateType: 'VenueBooking', aggregateId: 'B1',
  payload: { bookingId: 'B1', venueId: 'V1', venueName: 'Hall A', eventId: 'E1', eventName: 'Tech Summit', coordinatorId: 'c1', organiserId: 'o1', ...payload },
}, lookups);
const inbox = async (user) => (await store.listFor(user)).items;

test.beforeEach(() => store.reset());

test('TC-CS51-01 Coordinator told of a venue rejection with the reason', async () => {
  await send('BookingDecided', { decision: 'REJECTED', reason: 'Stage refurbishment' });
  const [notice] = await inbox('c1');
  assert.equal(notice.type, 'VENUE_REJECTED');
  assert.match(notice.text, /Stage refurbishment/);
  assert.equal(notice.data.bookingId, 'B1');
  // The Organiser is told the outcome, not the internal reason.
  const [organiser] = await inbox('o1');
  assert.equal(organiser.type, 'VENUE_DECISION');
  assert.doesNotMatch(organiser.text, /refurbishment/);
});

test('TC-CS51-02 venue made unavailable: Coordinator told an alternative is needed; nothing says cancelled', async () => {
  await send('VenueUnavailable', { reason: 'Maintenance' });
  const [notice] = await inbox('c1');
  assert.equal(notice.type, 'VENUE_UNAVAILABLE');
  assert.match(notice.text, /alternative/);
  assert.match(notice.text, /marked for replacement/);
  assert.doesNotMatch(notice.text, /cancel/i);
});

test('TC-CS51-03 every active Venue Staff member gets "New booking request"', async () => {
  await send('BookingRequested', {});
  for (const id of ['vs1', 'vs2']) {
    const [notice] = await inbox(id);
    assert.equal(notice.type, 'NEW_BOOKING_REQUEST');
    assert.match(notice.text, /New booking request/);
    assert.equal(notice.link, '/venue');
  }
  assert.deepEqual(await inbox('c1'), [], 'the requesting Coordinator is not notified of their own request');
});

test('TC-CS51-04 the Organiser gets no internal staff notices and no internal reason text', async () => {
  await send('VenueUnavailable', { reason: 'Maintenance' }, 'u1');
  await send('BufferConflictFlagged', {}, 'b1');
  const items = await inbox('o1');
  assert.deepEqual(items.filter((n) => ['VENUE_UNAVAILABLE', 'BUFFER_CONFLICT'].includes(n.type)), []);
  assert.doesNotMatch(items.map((n) => n.text).join(' '), /Maintenance/);
  assert.equal(items[0].type, 'VENUE_CHANGE_NEEDED', 'Session 3: told the affected venue and next step');
});

test('TC-CS51-05u/07u hold warning and expiry go to the Coordinator; one warning per deadline message', async () => {
  // The scheduler (CS-37/CS-90) decides when to send and gives each deadline its own message id.
  await send('HoldExpiring', { expiresAt: '2027-01-12T10:00:00.000Z' }, 'hold-H1-2027-01-12T10:00Z');
  await send('HoldExpiring', { expiresAt: '2027-01-12T10:00:00.000Z' }, 'hold-H1-2027-01-12T10:00Z');
  await send('HoldExpired', {}, 'hold-H1-expired');
  const types = (await inbox('c1')).map((n) => n.type).sort();
  assert.deepEqual(types, ['HOLD_EXPIRED', 'HOLD_EXPIRING']);
});

test('TC-CS51-06 a safety change request alerts only the affected area', async () => {
  await send('SafetyChangesRequested', { areas: ['EQUIPMENT'], comment: 'Cable run blocks exit' });
  assert.equal((await inbox('ts1'))[0].type, 'SAFETY_CHANGES_REQUESTED');
  assert.equal((await inbox('c1'))[0].type, 'SAFETY_CHANGES_REQUESTED');
  assert.deepEqual(await inbox('vs1'), [], 'Venue Staff not involved');
  assert.match((await inbox('o1'))[0].text, /Cable run blocks exit/, 'actionable comment allowed for the Organiser');
});

test('TC-CS51-08 return-for-amendment notice carries the Coordinator comments', async () => {
  await deliver({ id: 'ret-1', type: 'RequestReturned', aggregateId: 'r1', payload: { eventRequestId: 'r1', organiserId: 'o1', eventName: 'Tech Summit', comment: 'Add layout' } }, lookups);
  const [notice] = await inbox('o1');
  assert.equal(notice.type, 'REQUEST_RETURNED');
  assert.match(notice.text, /Add layout/);
  assert.equal(notice.data.comment, 'Add layout');
});

test('TC-CS51-09 one venue approved is not reported as the whole event being ready', async () => {
  await send('BookingDecided', { decision: 'APPROVED', remainingRequired: 2 });
  const [notice] = await inbox('c1');
  assert.equal(notice.type, 'VENUE_APPROVED');
  assert.match(notice.text, /2 other required venue/);
  assert.doesNotMatch(notice.text, /confirmed|ready/i);
});

test('TC-CS51-10 staff lookup failure is retried, then Failed, without partial notices', async () => {
  const result = await deliver({ id: 'staff-down', type: 'BookingRequested', aggregateId: 'B9', payload: { bookingId: 'B9', eventName: 'X' } },
    { names: async () => 'x', usersWithRole: async () => { throw new Error('user-service down'); } });
  assert.equal(result.result, 'failed');
  assert.equal(store.state.notifications.length, 0);
});
