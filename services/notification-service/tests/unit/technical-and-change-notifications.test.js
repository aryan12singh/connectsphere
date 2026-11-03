// CS-51 AC3/AC4 (technical requests, decisions, reservations, equipment
// flags) and CS-45 / CS-54 (change decisions, cancellation requests).
// Producers: equipment-service and event-service outboxes.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');
const config = require('../../src/config');
const { deliver } = require('../../src/deliver');

config.retryDelayMs = 0;
const staff = { TECHNICAL_SUPPORT_STAFF: ['ts1', 'ts2'], VENUE_STAFF: ['vs1'] };
const lookups = { names: async () => 'Casey One', usersWithRole: async (role) => staff[role] || [] };
const send = (type, payload, id = `m-${type}`, aggregateType = 'TechnicalRequest') => deliver({
  id, type, aggregateType, aggregateId: 'R1',
  payload: { eventRequestId: 'R1', eventId: 'E1', eventName: 'Tech Summit', coordinatorId: 'c1', organiserId: 'o1', ...payload },
}, lookups);
const inbox = async (user) => (await store.listFor(user)).items;

test.beforeEach(() => store.reset());

test('CS-51 AC3 a submitted technical request notifies every active Technical Support member', async () => {
  await send('TechRequestSubmitted', { status: 'PENDING_TECH_REVIEW' });
  for (const id of ['ts1', 'ts2']) {
    const [notice] = await inbox(id);
    assert.equal(notice.type, 'NEW_TECHNICAL_REQUEST');
    assert.equal(notice.link, '/technical-requirements');
  }
  assert.deepEqual(await inbox('vs1'), []);
  assert.deepEqual(await inbox('c1'), [], 'the submitting Coordinator is not told of their own request');
});

test('CS-51 AC3 a technical decision reaches the Coordinator and Organiser with the next step', async () => {
  await send('TechRequestDecided', { status: 'APPROVED' }, 'approve');
  assert.match((await inbox('c1'))[0].text, /approved\. Technical Support will reserve the equipment/);
  assert.equal((await inbox('o1'))[0].type, 'TECHNICAL_DECISION');

  store.reset();
  await send('TechRequestDecided', { status: 'REJECTED', decisionReason: 'Projector bulbs on order' }, 'reject');
  const [coordinator] = await inbox('c1');
  assert.equal(coordinator.type, 'TECHNICAL_REJECTED');
  assert.match(coordinator.text, /Projector bulbs on order/);
  const [organiser] = await inbox('o1');
  assert.doesNotMatch(organiser.text, /bulbs/, 'the internal reason stays with the Coordinator');
  assert.match(organiser.text, /Your Coordinator is arranging the next step/);
});

test('CS-51 AC3 a redelivered technical decision is noticed once', async () => {
  await send('TechRequestDecided', { status: 'APPROVED' }, 'same');
  assert.equal((await send('TechRequestDecided', { status: 'APPROVED' }, 'same')).result, 'duplicate');
  assert.equal((await inbox('c1')).length, 1);
});

test('CS-51 AC3 an equipment reservation is noticed to the Coordinator and Organiser', async () => {
  await send('EquipmentReserved', { requestVersion: 1 });
  assert.equal((await inbox('c1'))[0].type, 'EQUIPMENT_RESERVED');
  assert.equal((await inbox('o1'))[0].link, '/events/E1');
});

test('CS-51 AC4 an equipment flag tells the Coordinator the reason and the Organiser the next action only', async () => {
  await send('EquipmentUnavailable', { equipmentType: 'projector', quantity: 2, reason: 'Lamp failure', startAt: '2027-01-10T01:00:00.000Z', endAt: '2027-01-10T05:00:00.000Z' });
  const [coordinator] = await inbox('c1');
  assert.equal(coordinator.type, 'EQUIPMENT_UNAVAILABLE');
  assert.match(coordinator.text, /2 projector .*Lamp failure/);
  assert.equal(coordinator.data.equipmentType, 'projector');
  const [organiser] = await inbox('o1');
  assert.equal(organiser.type, 'EQUIPMENT_CHANGE_NEEDED');
  assert.doesNotMatch(organiser.text, /Lamp failure/);
  assert.doesNotMatch(organiser.text + coordinator.text, /cancel/i, 'a flag never reads as a cancellation');
});

test('CS-45 an approved change notifies the Organiser and says when planning reopens', async () => {
  await send('EventChangeApproved', { reopened: true, changedFields: ['startAt'] }, 'ca', 'EventRequest');
  const [notice] = await inbox('o1');
  assert.equal(notice.type, 'CHANGE_APPROVED');
  assert.match(notice.text, /back in planning/);
  store.reset();
  await send('EventChangeApproved', { reopened: false }, 'cb', 'EventRequest');
  assert.doesNotMatch((await inbox('o1'))[0].text, /back in planning/);
});

test('CS-45 a rejected change notifies the Organiser with the Coordinator reason', async () => {
  await send('EventChangeRejected', { reason: 'Hall is booked that day' }, 'cr', 'EventRequest');
  const [notice] = await inbox('o1');
  assert.equal(notice.type, 'CHANGE_REJECTED');
  assert.match(notice.text, /current arrangements stay in place/);
  assert.match(notice.text, /Hall is booked that day/);
  assert.deepEqual(await inbox('c1'), [], 'the deciding Coordinator is not told of their own decision');
});

test('CS-54 AC1 an Organiser cancellation request notifies the current Coordinator only', async () => {
  await send('EventCancellationRequested', { reason: 'Speaker withdrew' }, 'cx', 'EventRequest');
  const [notice] = await inbox('c1');
  assert.equal(notice.type, 'CANCELLATION_REQUESTED');
  assert.equal(notice.link, '/events/E1');
  assert.deepEqual(await inbox('o1'), []);
});
