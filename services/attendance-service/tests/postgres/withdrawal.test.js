const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('attendance');
const store = require('../../src/store');
const db = store.prismaClient();
const app = require('../../src/app');
let api;

async function seedEvent(eventId = `pg-cs49-${randomUUID()}`) {
  const now = Date.now();
  await store.saveEvent({
    id: eventId, eventId, title: 'CS-49 withdrawal integration', description: '', status: 'CONFIRMED', eventVersion: 1,
    startAt: new Date(now + 24 * 60 * 60_000), endAt: new Date(now + 26 * 60 * 60_000), timeZone: 'Asia/Singapore',
    registrationLimit: 1, registrationEnabled: true,
    registrationWindow: { startAt: new Date(now - 60_000).toISOString(), endAt: new Date(now + 24 * 60 * 60_000).toISOString() },
    withdrawalEnabled: true, withdrawalCutoffAt: new Date(now + 60 * 60_000), allowReregistration: true,
    organiserId: 'organiser-1', createdAt: new Date(now), updatedAt: new Date(now),
  });
  return eventId;
}

function headers(userId) { return { 'x-test-user-id': userId, 'x-test-role': 'ATTENDEE' }; }

before(async () => { api = await start(app); });
beforeEach(async () => { await db.attendanceOutbox.deleteMany(); await db.registration.deleteMany(); await db.event.deleteMany(); });
after(async () => { await api?.close(); await db.$disconnect(); });

test('TC-CS49-01/05 concurrent withdrawal commits one status change, one open place and one outbox action', async () => {
  const eventId = await seedEvent();
  const registration = await store.saveRegistration({ eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date() });
  const path = `/registrations/${registration.id}/withdraw`;
  const replies = await Promise.all(Array.from({ length: 8 }, () => api.http(path, { method: 'POST', headers: headers('attendee-1'), body: {} })));
  assert.ok(replies.every(reply => reply.status === 200));
  assert.equal(replies.filter(reply => reply.body.replayed).length, 7);
  assert.equal(await db.registration.count({ where: { eventId, status: 'WITHDRAWN' } }), 1);
  assert.equal(await db.registration.count({ where: { eventId, status: 'CONFIRMED' } }), 0);
  assert.equal(await db.attendanceOutbox.count({ where: { aggregateId: eventId, kind: 'RegistrationWithdrawn' } }), 1);
});

test('TC-CS49-01 failed outbox insert rolls withdrawal back and the same registration can retry', async () => {
  const eventId = await seedEvent();
  const registration = await store.saveRegistration({ eventId, userId: 'attendee-1', status: 'CONFIRMED', registeredAt: new Date() });
  await db.$executeRawUnsafe(`CREATE FUNCTION attendance_test_reject_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='RegistrationWithdrawn' THEN RAISE EXCEPTION 'isolated withdrawal rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER attendance_test_reject_withdrawal BEFORE INSERT ON attendance_outbox FOR EACH ROW EXECUTE FUNCTION attendance_test_reject_withdrawal()');
  try {
    assert.equal((await api.http(`/registrations/${registration.id}/withdraw`, { method: 'POST', headers: headers('attendee-1'), body: {} })).status, 500);
    assert.equal((await db.registration.findUnique({ where: { id: registration.id } })).status, 'CONFIRMED');
    assert.equal(await db.attendanceOutbox.count({ where: { aggregateId: eventId } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER attendance_test_reject_withdrawal ON attendance_outbox');
    await db.$executeRawUnsafe('DROP FUNCTION attendance_test_reject_withdrawal()');
  }
  const retry = await api.http(`/registrations/${registration.id}/withdraw`, { method: 'POST', headers: headers('attendee-1'), body: {} });
  assert.equal(retry.status, 200);
  assert.equal(await db.attendanceOutbox.count({ where: { aggregateId: eventId, kind: 'RegistrationWithdrawn' } }), 1);
});

test('TC-CS49-06 partial active-registration uniqueness preserves withdrawn records when re-registering is enabled', async () => {
  const eventId = await seedEvent();
  await store.saveRegistration({ eventId, userId: 'attendee-1', status: 'WITHDRAWN', registeredAt: new Date(Date.now() - 1000), withdrawnAt: new Date() });
  const result = await store.createRegistration(eventId, 'attendee-1');
  assert.equal(result.registration.status, 'CONFIRMED');
  assert.equal(await db.registration.count({ where: { eventId, userId: 'attendee-1' } }), 2);
  assert.equal(await db.registration.count({ where: { eventId, userId: 'attendee-1', status: 'CONFIRMED' } }), 1);
  assert.equal(await db.attendanceOutbox.count({ where: { aggregateId: eventId, kind: 'RegistrationCreated' } }), 1);
});
