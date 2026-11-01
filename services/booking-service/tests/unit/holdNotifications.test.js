const test = require('node:test');
const assert = require('node:assert/strict');
const { processDue } = require('../../src/holdNotifications');

function fixture(inserted) {
  const rows = [{ id: 'booking-1', eventId: 'event-1', venueId: 'venue-1', version: 3, expiresAt: new Date('2028-01-01T00:00:00.000Z') }];
  const writes = [],activities=[];
  let queries = 0;
  const tx = {
    $queryRaw: async () => (++queries === 1 ? rows : [{ at: new Date('2028-01-01T00:00:01.000Z') }]),
    venueBookingActivity:{create:async value=>activities.push(value)},
    bookingOutbox: { createMany: async value => { writes.push(value); return { count: inserted }; } },
  };
  return { prisma: { $transaction: async fn => fn(tx) }, writes, activities };
}

test('holdNotifications writes one deterministic deadline notice and returns its batch count', async () => {
  const { prisma, writes, activities } = fixture(1);
  assert.equal(await processDue(prisma), 1);
  assert.equal(writes[0].skipDuplicates, true);
  assert.equal(writes[0].data[0].kind, 'VenueHoldExpired');
  assert.match(writes[0].data[0].actionKey, /^deadline:booking-1:/);
  assert.equal(activities[0].data.action,'HOLD_EXPIRED');
});

test('holdNotifications records no history when another scan already claimed the deadline', async () => {
  const { prisma, writes, activities } = fixture(0);
  assert.equal(await processDue(prisma), 0);
  assert.equal(writes.length, 1);
  assert.equal(activities.length, 0);
});
