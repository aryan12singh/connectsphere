const test = require('node:test');
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;

test('legacy buffer configuration validates current communications and persists only acknowledged changes', async t => {
  const store = require('../../src/store');
  const legacy = require('../../src/legacyBuffers');
  store.reset();
  t.after(() => { global.fetch = nativeFetch; store.reset(); });
  const venue = { id: 'legacy', version: 1, setupMinutes: 0, turnaroundMinutes: 0, legacyBufferConfigurationPending: true };
  let acknowledgement = { id: 'legacy', version: 2, legacyBufferConfigurationPending: false, buffersLockedAt: '2028-01-01T00:00:00Z' };
  global.fetch = async url => ({ ok: true, status: 200, json: async () => String(url).includes('planning-context')
    ? { id: 'event', startAt: '2028-01-01T00:00:00Z', endAt: '2028-01-02T00:00:00Z', status: 'ARRANGEMENT_PENDING', currentCoordinatorId: 'coordinator', organiserId: 'organiser' }
    : String(url).endsWith('/internal') ? venue : acknowledgement });
  const room = store.createBooking({ venueId: 'legacy', eventId: 'event', title: 'Legacy room', reason: 'Imported', status: 'CONFIRMED', startAt: '2099-01-01T01:00:00Z', endAt: '2099-01-01T02:00:00Z' }, { id: 'staff', role: 'VENUE_STAFF' }, 'legacy-room');
  const preview = await legacy.preview('legacy');
  assert.equal(preview.affectedEvents.length, 1);
  assert.equal(preview.affectedEvents[0].organiserId, 'organiser');
  const communication = { ...preview.affectedEvents[0], staffInformedCoordinator: true, coordinatorInformedOrganiser: true, note: 'Contacts informed' };
  const body = { version: 1, communications: [communication] };
  for (const [patch, code] of [[{ version: 2 }, 'STALE_VENUE'], [{ communications: [] }, 'STALE_COMMUNICATION'], [{ communications: [{ ...communication, organiserId: 'former' }] }, 'STALE_COMMUNICATION'], [{ communications: [{ ...communication, note: ' ' }] }, 'COMMUNICATION_REQUIRED']]) {
    await assert.rejects(() => legacy.configure('legacy', { ...body, ...patch }), error => error.code === code);
  }
  assert.equal((await legacy.configure('legacy', body)).version, 2);
  assert.equal((await legacy.bufferStatus('legacy')).everConfirmed, true);
  acknowledgement = { ...acknowledgement, version: 99 };
  await assert.rejects(() => legacy.configure('legacy', body), error => error.code === 'VENUE_UNAVAILABLE');
  assert.equal(store.getBooking(room.id).status, 'CONFIRMED');
});

test('buffer recovery rejects stale or locked venues and requires a valid upstream acknowledgement', async t => {
  const legacy = require('../../src/legacyBuffers');
  const store = require('../../src/store');
  store.reset();
  t.after(() => { global.fetch = nativeFetch; store.reset(); });
  const venue = { id: 'recover', version: 1, setupMinutes: 0, turnaroundMinutes: 0, legacyBufferConfigurationPending: false };
  let status = 200;
  let reply = { id: 'recover', version: 2, buffersLockedAt: null };
  global.fetch = async url => ({ ok: String(url).endsWith('/internal') || status === 200, status, json: async () => String(url).endsWith('/internal') ? venue : reply });
  const body = { input: { version: 1 }, actor: { id: 'staff', role: 'VENUE_STAFF' } };
  await assert.rejects(() => legacy.recoverFence('recover', { ...body, input: { version: 2 } }), error => error.code === 'STALE_VENUE');
  assert.equal((await legacy.recoverFence('recover', body)).version, 2);
  reply = { ...reply, buffersLockedAt: '2028-01-01T00:00:00Z' };
  await assert.rejects(() => legacy.recoverFence('recover', body), error => error.code === 'VENUE_UNAVAILABLE');
  status = 409; reply = { error: { code: 'STALE_VENUE', message: 'Source changed' } };
  await assert.rejects(() => legacy.recoverFence('recover', body), error => error.code === 'STALE_VENUE');
  venue.legacyBufferConfigurationPending = true;
  await assert.rejects(() => legacy.recoverFence('recover', body), error => error.code === 'VENUE_BUFFERS_LOCKED');
});

test('legacyBuffers rejects configuration preview when the venue is no longer in initial configuration', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'venue-1', version: 1, setupMinutes: 0, turnaroundMinutes: 0, legacyBufferConfigurationPending: false }) });
  const legacyBuffers = require('../../src/legacyBuffers');
  await assert.rejects(() => legacyBuffers.preview('venue-1'), error => error.code === 'LEGACY_CONFIGURATION_CLOSED');
});
