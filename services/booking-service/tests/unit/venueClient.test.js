const test = require('node:test');
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;
const response = (status, value = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('Venue client rejects malformed context, catalogue, deletion and buffer acknowledgements', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  const { venueContext, catalogue, removeVenue, lockVenueBuffers } = require('../../src/venueClient');
  const venue = { id: 'v', version: 2, setupMinutes: 10, turnaroundMinutes: 15 };
  const staff = { id: 'staff', role: 'VENUE_STAFF' };
  for (const body of [{}, { ...venue, version: 0 }, { ...venue, setupMinutes: -1 }, { ...venue, turnaroundMinutes: -1 }]) {
    global.fetch = async () => response(200, body);
    await assert.rejects(() => venueContext('v'), error => error.code === 'VENUE_UNAVAILABLE');
  }
  global.fetch = async () => response(200, {});
  await assert.rejects(() => catalogue(), error => error.code === 'VENUE_UNAVAILABLE');
  global.fetch = async () => response(503);
  await assert.rejects(() => venueContext('v'), error => error.status === 503);
  await assert.rejects(() => catalogue(), error => error.status === 503);
  await assert.rejects(() => removeVenue('v', 2, 'op', staff), error => error.status === 503);
  await assert.rejects(() => lockVenueBuffers(venue, staff), error => error.status === 503);
  global.fetch = async () => response(404);
  assert.equal(await removeVenue('v', 2, 'op', staff), false);
  global.fetch = async () => response(409);
  await assert.rejects(() => lockVenueBuffers(venue, staff), error => error.code === 'STALE_VENUE');
  for (const patch of [{ id: 'other' }, { buffersLockedAt: null }, { buffersLockedAt: 'invalid' }, { version: 1 }, { setupMinutes: 11 }, { turnaroundMinutes: 16 }]) {
    global.fetch = async () => response(200, { ...venue, buffersLockedAt: '2028-01-01T00:00:00Z', ...patch });
    await assert.rejects(() => lockVenueBuffers(venue, staff), error => error.code === 'VENUE_UNAVAILABLE');
  }
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(() => venueContext('v'), error => error.code === 'VENUE_UNAVAILABLE');
  await assert.rejects(() => lockVenueBuffers(venue, staff), error => error.code === 'VENUE_UNAVAILABLE');
});

test('venueClient handles valid catalogue data and upstream stale or unavailable responses', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  const { venueContext, catalogue, removeVenue, lockVenueBuffers } = require('../../src/venueClient');
  const venue = { id: 'venue-1', version: 2, setupMinutes: 10, turnaroundMinutes: 15, buffersLockedAt: '2028-01-01T00:00:00.000Z' };
  global.fetch = async url => {
    const value = String(url);
    if (value.includes('catalogue')) return response(200, { items: [venue] });
    if (value.includes('buffer-lock')) return response(200, venue);
    if (value.includes('/venues/venue-1/internal')) return response(200, venue);
    return response(204);
  };
  assert.deepEqual(await venueContext('venue-1'), venue);
  assert.deepEqual(await catalogue(), [venue]);
  assert.equal(await removeVenue('venue-1', 2, 'op', { id: 'staff', role: 'VENUE_STAFF' }), true);
  assert.equal((await lockVenueBuffers({ ...venue, buffersLockedAt: null }, { id: 'staff', role: 'VENUE_STAFF' })).id, 'venue-1');
  global.fetch = async () => response(409, {});
  await assert.rejects(() => removeVenue('venue-1', 2, 'op', {}), error => error.code === 'STALE_VENUE');
  global.fetch = async () => response(404, {});
  await assert.rejects(() => venueContext('missing'), error => error.code === 'VENUE_NOT_FOUND');
  global.fetch = async () => { throw new Error('network'); };
  await assert.rejects(() => catalogue(), error => error.code === 'VENUE_UNAVAILABLE');
});
