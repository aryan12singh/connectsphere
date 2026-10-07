// Unit tests for choosing a Coordinator (CS-30). Pure functions, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCoordinator, countsAsActive } = require('../src/domain/assignment');

const coord = (id, createdAt) => ({ id, createdAt: new Date(createdAt) });
const A = coord('a', '2026-05-01T01:00:00Z'); // longest-serving
const B = coord('b', '2026-05-01T01:05:00Z');
const C = coord('c', '2026-05-01T01:10:00Z');

test('picks the Coordinator with the fewest active requests', () => {
  assert.equal(pickCoordinator([A, B, C], { a: 3, b: 1, c: 2 }), 'b');
});

test('a Coordinator missing from the load map has zero active requests', () => {
  assert.equal(pickCoordinator([A, B], { a: 2 }), 'b');
});

test('no assignment history: creation time resolves the remaining tie', () => {
  assert.equal(pickCoordinator([C, B, A], { a: 2, b: 2, c: 2 }), 'a');
});

test('tie-break ignores the order the list arrives in', () => {
  assert.equal(pickCoordinator([B, C, A], { a: 0, b: 0, c: 0 }), 'a');
  assert.equal(pickCoordinator([A, B, C], { a: 0, b: 0, c: 0 }), 'a');
});

test('same createdAt: lowest id wins, so the result is always the same', () => {
  const x = coord('x2', '2026-05-01T01:00:00Z');
  const y = coord('x1', '2026-05-01T01:00:00Z');
  assert.equal(pickCoordinator([x, y], {}), 'x1');
});

test('load beats experience: a busy senior loses to a free junior', () => {
  assert.equal(pickCoordinator([A, C], { a: 5, c: 0 }), 'c');
});

test('no Coordinator: returns null (the request becomes "Awaiting assignment")', () => {
  assert.equal(pickCoordinator([], {}), null);
  assert.equal(pickCoordinator(undefined, {}), null);
});

test('does not change the input list', () => {
  const list = [C, B, A];
  pickCoordinator(list, {});
  assert.deepEqual(list.map((c) => c.id), ['c', 'b', 'a']);
});

// CS-30 test case 30-06 (boundary)
test('30-06: without history creation time resolves ties; workload takes priority', () => {
  assert.equal(pickCoordinator([A, B], { a: 3, b: 3 }), 'a');
  assert.equal(pickCoordinator([B, A], { a: 3, b: 3 }), 'a');
  assert.equal(pickCoordinator([A, B], { a: 3, b: 4 }), 'a');
  // and when the earlier one is the busier one, the other is picked
  assert.equal(pickCoordinator([A, B], { a: 4, b: 3 }), 'b');
});

// What counts as "active" (decision D3)
test('countsAsActive: open responsibility only', () => {
  const yes = [
    { requestStatus: 'SUBMITTED' },
    { requestStatus: 'RETURNED_FOR_AMENDMENT' },
    { requestStatus: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING' },
    { requestStatus: 'APPROVED', eventStatus: 'CONFIRMED' },
  ];
  const no = [
    { requestStatus: 'DRAFT' },
    { requestStatus: 'REJECTED' },
    { requestStatus: 'REJECTED', eventStatus: 'REJECTED' },
    { requestStatus: 'APPROVED', eventStatus: 'CANCELLED' },
    { requestStatus: 'APPROVED', eventStatus: 'COMPLETED' },
    { requestStatus: 'APPROVED' }, // approved but no event row yet: not counted
  ];
  for (const r of yes) assert.equal(countsAsActive(r), true, JSON.stringify(r));
  for (const r of no) assert.equal(countsAsActive(r), false, JSON.stringify(r));
});

// User policy selection, 2026-10-06: workload first, least recently assigned next.
test('equal load chooses least recently assigned, including revoked/closed work', () => {
  assert.equal(pickCoordinator([A,B], {a:2,b:2}, {a:'2026-10-05T00:00:00Z',b:'2026-10-01T00:00:00Z'}), 'b');
});
test('never assigned takes priority in a workload tie, then creation time/id', () => {
  assert.equal(pickCoordinator([A,B,C], {}, {a:'2026-10-01T00:00:00Z'}), 'b');
  assert.equal(pickCoordinator([B,A], {}, {}), 'a');
});
test('workload still beats last-assigned fairness and does not mutate inputs', () => {
  const dates={a:'2026-10-05T00:00:00Z',b:'2026-10-01T00:00:00Z'};
  assert.equal(pickCoordinator([A,B], {a:0,b:1}, dates), 'a');
  assert.deepEqual(dates,{a:'2026-10-05T00:00:00Z',b:'2026-10-01T00:00:00Z'});
});
