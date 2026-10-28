// CS-52: Notify Attendees of registration outcomes and Event changes.
//
// One test per acceptance criterion (TC-CS52-01 to TC-CS52-06). Messages are
// built in the shape the producers publish (see docs/api-contract.md, CS-52
// section). Waitlist and withdrawal producers are not in Release 1 main yet
// (CS-48 excludes the waitlist; CS-49 is pending), so those cases check the
// notification contract with sample messages only.
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const store = require('../../src/store');
const { deliver } = require('../../src/deliver');
const { noticesFor } = require('../../src/templates');
const { currentContext } = require('../../src/currentContext');
const { registeredAttendees } = require('../../src/userClient');

config.retryDelayMs = 0; // no waiting between retries in tests

// Attendance-service already leaves out Withdrawn Attendees, so the stub
// returns only the active ones (attendee-1 registered, attendee-2 waitlisted).
const lookups = {
  names: async () => 'Current Coordinator',
  usersWithRole: async () => [],
  attendeeIds: async () => ['attendee-1', 'attendee-2'],
};
const message = (type, payload = {}, id = `msg-${type}`, aggregateType = 'Event') => ({
  id, type, aggregateType, aggregateId: 'event-1',
  payload: {
    eventId: 'event-1', eventRequestId: 'request-1', eventName: 'Community Summit',
    organiserId: 'organiser-1', coordinatorId: 'coordinator-1', ...payload,
  },
});
const inbox = async (recipient) => (await store.listFor(recipient)).items;
// The only data keys an Attendee notice may carry.
const SAFE_KEYS = ['eventName', 'eventId', 'eventVersion', 'timestamp', 'startAt', 'endAt', 'timeZone', 'venueNames'];
const assertAttendeeSafe = (row) => {
  assert.equal(row.eventRequestId, null, 'no planning request id');
  for (const key of Object.keys(row.data)) assert.ok(SAFE_KEYS.includes(key), `unexpected data key ${key}`);
  assert.match(row.link, /^\/attendances\/events\//);
};

test.beforeEach(() => store.reset());

test('TC-CS52-01 each registration outcome notifies only the Attendee it is about', async () => {
  const cases = [
    ['RegistrationCreated', 'REGISTRATION_CONFIRMED', 'is confirmed'],
    ['RegistrationWaitlisted', 'REGISTRATION_WAITLISTED', 'waitlist'], // contract only (CS-48 excludes waitlist)
    ['WaitlistOfferMade', 'WAITLIST_OFFER_MADE', 'A place is available'], // contract only
    ['WaitlistOfferExpired', 'WAITLIST_OFFER_EXPIRED', 'has expired'], // contract only
    ['WaitlistOfferAccepted', 'WAITLIST_OFFER_ACCEPTED', 'Your place is confirmed'], // contract only
    ['RegistrationWithdrawn', 'REGISTRATION_WITHDRAWN', 'was withdrawn'], // contract only (CS-49 pending)
  ];
  for (const [type, noticeType, words] of cases) {
    const result = await deliver(message(type, { userId: 'attendee-1' }, `reg-${type}`), lookups);
    assert.equal(result.notices, 1, type);
    const row = (await inbox('attendee-1')).find((n) => n.sourceMessageId === `reg-${type}`);
    assert.equal(row.type, noticeType);
    assert.ok(row.text.includes('Community Summit') && row.text.includes(words), row.text);
    assertAttendeeSafe(row);
  }
  // Nobody else hears about attendee-1's registration.
  for (const other of ['attendee-2', 'organiser-1', 'coordinator-1']) assert.deepEqual(await inbox(other), []);
});

test('TC-CS52-02 an effective venue replacement among several venues sends final details to active Attendees', async () => {
  const askedFor = [];
  const notices = await noticesFor(message('EventConfirmed', {
    roundId: 'round-2', eventVersion: 5, attendeeVenueChanged: true, attendeeMaterialChange: false,
    startAt: '2027-03-23T01:00:00.000Z', endAt: '2027-03-23T09:00:00.000Z', timeZone: 'Asia/Singapore',
    venueNames: ['Riverside Hall', 'Replacement Room B'],
  }), { ...lookups, attendeeIds: async (eventId) => { askedFor.push(eventId); return ['attendee-1', 'attendee-2', 'attendee-1']; } });
  const attendees = notices.filter((n) => n.recipientId.startsWith('attendee-'));
  // One notice each (duplicate id in the list is ignored), both venues named.
  assert.deepEqual(attendees.map((n) => n.recipientId), ['attendee-1', 'attendee-2']);
  for (const row of attendees) {
    assert.equal(row.type, 'VENUE_CHANGED');
    assert.ok(row.text.includes('Riverside Hall, Replacement Room B') && row.text.includes('23 Mar 2027') && row.text.includes('09:00'));
    assert.equal(row.data.eventVersion, 5);
    assertAttendeeSafe(row);
  }
  // Registrations are kept: notification-service only reads the recipient list.
  assert.deepEqual(askedFor, ['event-1']);
  // A confirmation with no attendee-facing change tells only the Organiser.
  const unchanged = await noticesFor(message('EventConfirmed', { roundId: 'round-1', attendeeMaterialChange: false }), lookups);
  assert.deepEqual(unchanged.map((n) => [n.recipientId, n.type]), [['organiser-1', 'EVENT_CONFIRMED']]);
});

test('TC-CS52-03 whole-Event cancellation notifies registered and waitlisted Attendees once each', async () => {
  // Publisher snapshot (CS-54 contract) is used when present and de-duplicated.
  const fromSnapshot = await noticesFor(message('EventCancelled', { attendeeRecipientIds: ['attendee-3', 'attendee-3', 'attendee-4'] }), lookups);
  assert.deepEqual(fromSnapshot.map((n) => n.recipientId), ['attendee-3', 'attendee-4']);
  // Without a snapshot, attendance-service's active list is used.
  const fromLookup = await noticesFor(message('EventCancelled'), lookups);
  assert.deepEqual(fromLookup.map((n) => n.recipientId), ['attendee-1', 'attendee-2']);
  for (const row of [...fromSnapshot, ...fromLookup]) {
    assert.equal(row.type, 'EVENT_CANCELLED');
    assert.equal(row.text, '"Community Summit" has been cancelled.');
    assertAttendeeSafe(row);
  }
  // The Organiser and Coordinator are not sent an Attendee cancellation notice.
  assert.ok(!fromLookup.some((n) => ['organiser-1', 'coordinator-1'].includes(n.recipientId)));
});

test('TC-CS52-04 pending changes never reach Attendees; the Organiser hears about an affected venue at once', async () => {
  // Pending replacement/change steps notify planners only.
  for (const type of ['ReplacementApproved', 'BookingRestored', 'SafetyApproved']) {
    const notices = await noticesFor(message(type, { venueName: 'Riverside Hall' }, `m-${type}`, 'VenueBooking'), lookups);
    assert.ok(notices.every((n) => !n.recipientId.startsWith('attendee-')), type);
  }
  // Affected venue: Organiser is told immediately, Attendees are not.
  const affected = await noticesFor(message('VenueUnavailable', {
    venueName: 'Riverside Hall', unavailability: [{ startAt: '2027-03-23T01:00:00Z', endAt: '2027-03-23T03:00:00Z', category: 'MAINTENANCE' }],
  }, 'm-unavailable', 'VenueBooking'), lookups);
  assert.ok(affected.some((n) => n.recipientId === 'organiser-1' && n.type === 'VENUE_CHANGE_NEEDED'));
  assert.ok(affected.every((n) => !n.recipientId.startsWith('attendee-')));

  // An EventConfirmed whose Safety round is no longer the current approved one
  // is suppressed by the current-source check, so it is never sent as final.
  const native = global.fetch;
  let planning = { id: 'event-1', eventRequestId: 'request-1', organiserId: 'organiser-1', currentCoordinatorId: 'coordinator-1', title: 'Community Summit', status: 'CONFIRMED', safetyState: 'APPROVED', safetyRoundId: 'round-2' };
  global.fetch = async () => ({ ok: true, status: 200, json: async () => planning });
  try {
    const confirmed = message('EventConfirmed', { roundId: 'round-2', attendeeVenueChanged: true });
    assert.ok(await currentContext(confirmed));
    planning = { ...planning, safetyRoundId: 'round-3', safetyState: 'PENDING' }; // a newer change is still pending
    assert.equal(await currentContext(confirmed), null);
    planning = { ...planning, status: 'ARRANGEMENT_PENDING', safetyRoundId: 'round-2', safetyState: 'APPROVED' };
    assert.equal(await currentContext(confirmed), null);
    // Delivered through deliver(): ignored, nothing stored for anyone.
    const result = await deliver({ ...confirmed, id: 'stale-confirm' }, { ...lookups, currentContext });
    assert.equal(result.result, 'ignored');
    assert.deepEqual(await inbox('attendee-1'), []);
  } finally { global.fetch = native; }
});

test('TC-CS52-05 Attendee notices never expose other Attendees, internal comments or review evidence', async () => {
  const secrets = { reason: 'Private Safety note: crowd risk', comment: 'Internal planning comment', evidence: 'safety-evidence.pdf', privateNotes: 'do not share' };
  const rows = [
    ...(await noticesFor(message('RegistrationCreated', { userId: 'attendee-1', ...secrets }), lookups)),
    ...(await noticesFor(message('EventConfirmed', { attendeeMaterialChange: true, venueNames: ['Riverside Hall'], ...secrets }), lookups)),
    ...(await noticesFor(message('EventCancelled', { attendeeRecipientIds: ['attendee-1', 'attendee-2'], ...secrets }), lookups)),
  ].filter((n) => n.recipientId.startsWith('attendee-'));
  assert.ok(rows.length >= 5);
  for (const row of rows) {
    const visible = JSON.stringify({ text: row.text, link: row.link, data: row.data, eventRequestId: row.eventRequestId });
    for (const secret of Object.values(secrets)) assert.ok(!visible.includes(secret), `${row.type} leaked ${secret}`);
    const other = row.recipientId === 'attendee-1' ? 'attendee-2' : 'attendee-1';
    assert.ok(!visible.includes(other), `${row.type} names another Attendee`);
    assertAttendeeSafe(row);
  }
});

test('TC-CS52-06 retries keep stable identities, distinct changes notify separately, and no command is repeated', async () => {
  // Attendance-service is down for the first attempt, then recovers.
  let calls = 0;
  const flaky = { ...lookups, attendeeIds: async () => { calls += 1; if (calls === 1) throw new Error('attendance down'); return ['attendee-1']; } };
  const change = (id, version) => message('EventConfirmed', { attendeeMaterialChange: true, eventVersion: version, venueNames: ['Riverside Hall'] }, id);
  assert.equal((await deliver(change('change-v4', 4), flaky)).result, 'processed');
  assert.equal((await store.getReceipt('change-v4')).attempts, 2);
  // Redelivery of the same message is a duplicate: no second notice.
  assert.equal((await deliver(change('change-v4', 4), flaky)).result, 'duplicate');
  // A later, distinct effective change is its own notice.
  assert.equal((await deliver(change('change-v5', 5), flaky)).result, 'processed');
  const rows = await inbox('attendee-1');
  assert.deepEqual(rows.map((n) => [n.sourceMessageId, n.type, n.data.eventVersion]).sort(),
    [['change-v4', 'EVENT_CHANGED', 4], ['change-v5', 'EVENT_CHANGED', 5]]);

  // The recipient lookup is a read-only internal GET: delivery never sends a
  // registration or withdrawal command back to attendance-service.
  const native = global.fetch;
  const seen = [];
  global.fetch = async (url, init = {}) => { seen.push({ url: String(url), method: init.method || 'GET', key: init.headers?.['x-internal-api-key'] }); return { ok: true, json: async () => ({ items: ['attendee-1'] }) }; };
  try {
    assert.deepEqual(await registeredAttendees('event-1'), ['attendee-1']);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, 'GET');
    assert.match(seen[0].url, /\/internal\/events\/event-1\/notification-recipients$/);
    assert.equal(seen[0].key, config.internalApiKey);
  } finally { global.fetch = native; }
});
