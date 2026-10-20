const test = require('node:test');
const assert = require('node:assert/strict');
const { attendancePlan } = require('../../src/attendancePlan');

test('attendancePlan evaluates simultaneous required-room allocations without summing separate sessions', () => {
  const rooms = [
    { id: 'a', required: true, status: 'CONFIRMED', startAt: '2028-01-01T01:00:00.000Z', endAt: '2028-01-01T02:00:00.000Z', expectedAttendance: 50 },
    { id: 'b', required: true, status: 'CONFIRMED', startAt: '2028-01-01T02:00:00.000Z', endAt: '2028-01-01T03:00:00.000Z', expectedAttendance: 50 },
    { id: 'cancelled', required: true, status: 'CANCELLED', startAt: '2028-01-01T01:00:00.000Z', endAt: '2028-01-01T03:00:00.000Z', expectedAttendance: 999 },
  ];
  const result = attendancePlan({ expectedAttendance: 50 }, rooms);
  assert.equal(result.ready, true);
  assert.equal(result.sessions.length, 2);
  assert.deepEqual(result.sessions.map(session => session.allocated), [50, 50]);
  assert.equal(attendancePlan({ expectedAttendance: 60 }, rooms).sessions[0].reason, 'ATTENDANCE_ALLOCATION_INCOMPLETE');
  assert.equal(attendancePlan({ expectedAttendance: 50 }, [{ ...rooms[0], expectedAttendance: 0 }]).sessions[0].reason, 'ATTENDANCE_ALLOCATION_UNVERIFIED');
});
