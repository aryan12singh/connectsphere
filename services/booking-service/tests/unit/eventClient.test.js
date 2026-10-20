const test = require('node:test');
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;
const response = (status, value = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('Event access fails closed for denied, unavailable and mismatched upstream responses', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  const { canBookEvent, planningContext } = require('../../src/eventClient');
  const req = { actor: { id: 'coordinator', role: 'EVENT_COORDINATOR' }, get: () => '' };
  for (const status of [403, 404]) {
    global.fetch = async () => response(status);
    assert.equal(await canBookEvent(req, 'event-1'), false);
  }
  global.fetch = async () => response(503);
  await assert.rejects(() => canBookEvent(req, 'event-1'), /unavailable/);
  global.fetch = async () => response(200, { id: 'other-event' });
  await assert.rejects(() => canBookEvent(req, 'event-1'), /Invalid event assignment/);
  global.fetch = async () => response(404);
  await assert.rejects(() => planningContext('event-1'), error => error.code === 'EVENT_NOT_FOUND');
  global.fetch = async () => response(503);
  await assert.rejects(() => planningContext('event-1'), error => error.code === 'EVENT_UNAVAILABLE');
  global.fetch = async () => response(200, {});
  await assert.rejects(() => planningContext('event-1'), error => error.code === 'EVENT_UNAVAILABLE');
});

test('Event planning preserves unknown accessibility needs and handles omitted optional labels', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  const { planningContext } = require('../../src/eventClient');
  const context = { id: 'event-1', startAt: '2028-01-01T00:00:00Z', endAt: '2028-01-01T01:00:00Z', status: 'ARRANGEMENT_PENDING', currentCoordinatorId: 'coordinator' };
  global.fetch = async () => response(200, context);
  assert.deepEqual((await planningContext('event-1')).accessibilityNeeds, []);
  global.fetch = async () => response(200, { ...context, venueType: ' virtual ', preferredLayout: ' virtual ', accessibilityNeeds: ['hearing loop / assisted listening', 'bespoke access'] });
  const result = await planningContext('event-1');
  assert.equal(result.venueType, 'VIRTUAL');
  assert.equal(result.preferredLayout, 'VIRTUAL');
  assert.deepEqual(result.accessibilityNeeds, ['HEARING_LOOP', 'bespoke access']);
});

test('eventClient validates booking access and normalises planning context', async t => {
  t.after(() => { global.fetch = nativeFetch; });
  const { canBookEvent, planningContext } = require('../../src/eventClient');
  global.fetch = async url => {
    if (String(url).includes('booking-access')) return response(200, { id: 'event-1' });
    return response(200, { id: 'event-1', startAt: '2028-01-01T00:00:00.000Z', endAt: '2028-01-01T01:00:00.000Z', status: 'ARRANGEMENT_PENDING', currentCoordinatorId: 'coordinator', accessibilityNeeds: ['wheelchair_access'], preferredLayout: ' theatre ' });
  };
  assert.equal(await canBookEvent({ actor: { id: 'coordinator', role: 'EVENT_COORDINATOR' }, get: () => 'Bearer token' }, 'event-1'), true);
  assert.equal(await canBookEvent({ actor: { id: 'coordinator', role: 'EVENT_COORDINATOR' }, get: () => '' }, ''), false);
  assert.deepEqual((await planningContext('event-1')).accessibilityNeeds, ['WHEELCHAIR_ACCESS']);
  global.fetch = async () => { throw new Error('network'); };
  await assert.rejects(() => planningContext('event-1'), error => error.code === 'EVENT_UNAVAILABLE');
});
