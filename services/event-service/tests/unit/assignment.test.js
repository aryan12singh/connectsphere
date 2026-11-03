// Unit tests for Coordinator workload (CS-30). Pure function, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { countsAsActive } = require('../../src/domain/assignment');

// What counts as "active" (decision D3)
test('countsAsActive: open responsibility only', () => {
  const yes = [
    { requestStatus: 'SUBMITTED' },
    { requestStatus: 'RETURNED_FOR_AMENDMENT' },
    { requestStatus: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING' },
    { requestStatus: 'APPROVED', eventStatus: 'CONFIRMED' },
    { requestStatus: 'APPROVED', eventStatus: 'CANCELLING' },
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
