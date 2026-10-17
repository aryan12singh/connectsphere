const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withinHours } = require('../../src/hours');

function venue(timeZone, opensAt, closesAt, closedDays = []) {
  return { timeZone, operatingHours: ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].map(weekday => ({ weekday, opensAt, closesAt, isClosed: closedDays.includes(weekday) })) };
}
const fold = { startAt: '2026-11-01T01:20:00-04:00', endAt: '2026-11-01T01:10:00-05:00' };

test('TC-CS85-16 a repeated-hour window cannot cross the first closing time', () => {
  assert.equal(withinHours(fold, venue('America/New_York', '01:00', '01:30')), false);
});
test('TC-CS85-16 a repeated-hour window cannot enter time before reopening', () => {
  assert.equal(withinHours({ startAt: '2026-11-01T01:50:00-04:00', endAt: '2026-11-01T01:40:00-05:00' }, venue('America/New_York', '01:15', '03:00')), false);
});
test('TC-CS85-16 an open venue accepts the complete repeated-hour interval', () => {
  assert.equal(withinHours(fold, venue('America/New_York', '01:00', '02:00')), true);
  assert.equal(withinHours({ startAt: '2026-11-01T01:00:00-05:00', endAt: '2026-11-01T01:30:00-05:00' }, venue('America/New_York', '01:00', '01:30')), true);
});
test('TC-CS85-16 an interval ending at the rollback excludes the later repeated hour', () => {
  assert.equal(withinHours({ startAt: '2026-11-01T01:20:00-04:00', endAt: '2026-11-01T01:00:00-05:00' }, venue('America/New_York', '01:15', '02:00')), true);
});
test('TC-CS85-16 a non-hour rollback is checked on both sides', () => {
  const window = { startAt: '2027-04-04T01:50:00+11:00', endAt: '2027-04-04T01:40:00+10:30' };
  assert.equal(withinHours(window, venue('Australia/Lord_Howe', '01:30', '01:55')), false);
  assert.equal(withinHours(window, venue('Australia/Lord_Howe', '01:30', '02:00')), true);
});
test('TC-CS85-16 spring-forward windows use actual occupied instants', () => {
  const window = { startAt: '2027-03-14T01:30:00-05:00', endAt: '2027-03-14T03:30:00-04:00' };
  assert.equal(withinHours(window, venue('America/New_York', '01:00', '04:00')), true);
  assert.equal(withinHours(window, venue('America/New_York', '01:00', '03:00')), false);
});
test('TC-CS85-16 exact closing, subminute overflow and local midnight remain guarded', () => {
  const singapore = venue('Asia/Singapore', '09:00', '17:00');
  assert.equal(withinHours({ startAt: '2026-12-21T09:00:00+08:00', endAt: '2026-12-21T17:00:00+08:00' }, singapore), true);
  assert.equal(withinHours({ startAt: '2026-12-21T09:00:00+08:00', endAt: '2026-12-21T17:00:00.001+08:00' }, singapore), false);
  const midnight = { startAt: '2026-12-21T23:00:00+08:00', endAt: '2026-12-22T00:00:00+08:00' };
  assert.equal(withinHours(midnight, venue('Asia/Singapore', '00:00', '24:00', ['TUESDAY'])), true);
  assert.equal(withinHours({ ...midnight, endAt: '2026-12-22T00:00:00.001+08:00' }, venue('Asia/Singapore', '00:00', '24:00', ['TUESDAY'])), false);
});
test('TC-CS85-16 invalid, reversed, zero-length or unbounded windows fail closed', () => {
  const open = venue('Asia/Singapore', '00:00', '24:00');
  for (const window of [
    { startAt: 'bad', endAt: '2026-12-22T00:00:00Z' },
    { startAt: '2026-12-22T00:00:00Z', endAt: '2026-12-21T00:00:00Z' },
    { startAt: '2026-12-22T00:00:00Z', endAt: '2026-12-22T00:00:00Z' },
    { startAt: '2026-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
  ]) assert.equal(withinHours(window, open), false);
  assert.equal(withinHours(fold, { ...open, timeZone: 'Invalid/Zone' }), false);
});
