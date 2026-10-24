const test = require('node:test');
const assert = require('node:assert/strict');
const { processDue } = require('../../src/holdNotifications');

test('holdNotifications writes one deterministic deadline notice and returns its batch count', async () => {
  const rows = [{ id: 'booking-1', eventId: 'event-1', venueId: 'venue-1', version: 3, expiresAt: new Date('2028-01-01T00:00:00.000Z') }];
  const writes = [],activities=[];
  let queries = 0;
  const tx = {
    $queryRaw: async () => (++queries === 1 ? rows : [{ at: new Date('2028-01-01T00:00:01.000Z') }]),
    venueBookingActivity:{create:async value=>activities.push(value)},
    bookingOutbox: { upsert: async value => writes.push(value) },
  };
  const prisma = { $transaction: async fn => fn(tx) };
  assert.equal(await processDue(prisma), 1);
  assert.equal(writes[0].create.kind, 'VenueHoldExpired');
  assert.match(writes[0].create.actionKey, /^deadline:booking-1:/);
  assert.equal(activities[0].data.action,'HOLD_EXPIRED');
});
