const test = require('node:test');
const assert = require('node:assert/strict');
const { withinHours } = require('../../src/hours');

test('hours accepts a local opening window and rejects closed or out-of-hours windows', () => {
  const operatingHours = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].map(weekday => ({ weekday, isClosed: false, opensAt: '08:00', closesAt: '18:00' }));
  const venue = { timeZone: 'Asia/Singapore', operatingHours };
  assert.equal(withinHours({ startAt: '2028-11-20T01:00:00.000Z', endAt: '2028-11-20T02:00:00.000Z' }, venue), true);
  assert.equal(withinHours({ startAt: '2028-11-19T23:00:00.000Z', endAt: '2028-11-20T02:00:00.000Z' }, venue), false);
  assert.equal(withinHours({ startAt: 'bad', endAt: '2028-11-20T02:00:00.000Z' }, venue), false);
});
