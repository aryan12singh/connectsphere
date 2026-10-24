const test = require('node:test');
const assert = require('node:assert/strict');
const { project } = require('../../src/notificationOutbox');

test('outbox preserves original occurrence time and distinguishes rejection, conflict and expiry', async () => {
  const createdAt = new Date('2028-01-02T00:00:00Z');
  for (const [kind, type] of [['VenueBookingRejected', 'BookingDecided'], ['VenueConflictChanged', 'BufferConflictFlagged'], ['VenueHoldExpired', 'HoldExpired']]) {
    const result = await project({ id: 'intent', kind, aggregateId: 'booking', createdAt, payload: { flags: ['BUFFER_CONFLICT'], occurredAt: '2028-01-01T00:00:00.000Z' } });
    assert.equal(result.type, type);
    assert.equal(result.payload.occurredAt, '2028-01-01T00:00:00.000Z');
    if (kind === 'VenueBookingRejected') assert.equal(result.payload.decision, 'REJECTED');
  }
  assert.equal(await project({ kind: 'VenueConflictChanged', payload: {}, createdAt }), null);
  assert.equal(await project({kind:'VenueCancellationReleased',payload:{releasePhase:'CANCELLING'},createdAt}),null);
  assert.equal(require('../../src/notificationOutbox').start(), null);
});

test('notificationOutbox maps supported messages and excludes invalid conflict notices', async () => {
  const createdAt = new Date('2028-01-01T00:00:00.000Z');
  assert.equal(await project({ id: 'x', kind: 'Unknown', aggregateId: 'b', payload: {}, createdAt }), null);
  assert.equal(await project({ id: 'x', kind: 'VenueConflictChanged', aggregateId: 'b', payload: { flags: [] }, createdAt }), null);
  assert.deepEqual(await project({ id: 'x', kind: 'VenueBookingApproved', aggregateId: 'b', payload: { eventId: 'event-1' }, createdAt }), {
    id: 'x', type: 'BookingDecided', aggregateType: 'VenueBooking', aggregateId: 'b', payload: { eventId: 'event-1', occurredAt: createdAt.toISOString(), decision: 'APPROVED' },
  });
});
