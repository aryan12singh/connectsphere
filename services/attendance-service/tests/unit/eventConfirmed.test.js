const test = require('node:test');
const assert = require('node:assert/strict');
const { confirmedEvent, deliver } = require('../../src/eventConfirmed');

const message = (overrides = {}) => ({
  id: 'stable-message-1',
  type: 'EventConfirmed',
  aggregateType: 'Event',
  aggregateId: 'event-1',
  payload: {
    eventId: 'event-1',
    eventVersion: 2,
    status: 'CONFIRMED',
    title: 'Attendee event',
    description: 'Visible description',
    startAt: '2026-11-01T00:00:00.000Z',
    endAt: '2026-11-01T02:00:00.000Z',
    timeZone: 'Asia/Singapore',
    organiserId: 'organiser-1',
    registrationEnabled: true,
    registrationOpensAt: '2026-10-01T00:00:00.000Z',
    registrationClosesAt: '2026-10-31T00:00:00.000Z',
  },
  ...overrides,
});

test('TC-CS48-11 EventConfirmed maps attendee-safe details and registration settings to the local Event projection', () => {
  assert.deepEqual(confirmedEvent(message()), {
    id: 'event-1',
    eventId: 'event-1',
    title: 'Attendee event',
    description: 'Visible description',
    status: 'CONFIRMED',
    eventVersion: 2,
    startAt: new Date('2026-11-01T00:00:00.000Z'),
    endAt: new Date('2026-11-01T02:00:00.000Z'),
    timeZone: 'Asia/Singapore',
    organiserId: 'organiser-1',
    registrationEnabled: true,
    registrationWindow: { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' },
  });
});

test('TC-CS48-11 non-confirmation messages are acknowledged without changing Attendance Events', async () => {
  let calls = 0;
  const result = await deliver(message({ type: 'PreparationStarted' }), { upsertConfirmedEvent: async () => { calls += 1; } });
  assert.deepEqual(result, { result: 'ignored' });
  assert.equal(calls, 0);
});

test('TC-CS48-11 malformed or mismatched EventConfirmed messages are rejected', () => {
  assert.throws(() => confirmedEvent(message({ id: '' })), /Invalid EventConfirmed envelope/);
  assert.throws(() => confirmedEvent(message({ aggregateId: 'another-event' })), /Invalid EventConfirmed payload/);
  assert.throws(() => confirmedEvent(message({ payload: { ...message().payload, eventVersion: 0 } })), /Invalid EventConfirmed payload/);
});
