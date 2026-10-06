// Unit tests for the single transition guard (CS-32), which also covers the
// rules of CS-12 (approve) and CS-28 (reject / return). Pure functions, no
// database: run with `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, ACTIONS, ForbiddenError, InvalidTransitionError, ValidationError } = require('../src/domain/transitions');
const { displayStatus, REQUEST_LABELS, EVENT_LABELS } = require('../src/domain/statusLabels');

const ORG = { id: 'org-1', roles: ['EVENT_ORGANISER'] };
const COORD = { id: 'coord-A', roles: ['EVENT_COORDINATOR'] };
const OTHER_COORD = { id: 'coord-B', roles: ['EVENT_COORDINATOR'] };
const OTHER_ORG = { id: 'org-2', roles: ['EVENT_ORGANISER'] };
const SYSTEM = { id: null, system: true, roles: [] };

const NOW = new Date('2026-10-10T04:00:00Z'); // 12:00 in Singapore
const baseCtx = (extra = {}) => ({
  organiserId: 'org-1',
  currentCoordinatorId: 'coord-A',
  startAt: new Date('2026-11-20T01:00:00Z'),
  endAt: new Date('2026-11-20T10:00:00Z'),
  timeZone: 'Asia/Singapore',
  now: NOW,
  ...extra,
});
const req = (status) => ({ scope: 'REQUEST', status });
const evt = (status) => ({ scope: 'EVENT', status });

// ── every allowed row of the transition table ────────────────────────────
test('allowed rows', async (t) => {
  const rows = [
    ['Draft → Submit (owner) → Submitted', ACTIONS.SUBMIT, req('DRAFT'), ORG, {}, 'SUBMITTED'],
    ['Submitted → Approve (coordinator) → Approved + Planning', ACTIONS.APPROVE, req('SUBMITTED'), COORD, {}, 'APPROVED'],
    ['Submitted → Return (coordinator) → Returned', ACTIONS.RETURN, req('SUBMITTED'), COORD, { text: 'Please add a budget' }, 'RETURNED_FOR_AMENDMENT'],
    ['Returned → Resubmit (owner) → Submitted', ACTIONS.RESUBMIT, req('RETURNED_FOR_AMENDMENT'), ORG, {}, 'SUBMITTED'],
    ['Submitted → Reject → Rejected', ACTIONS.REJECT, req('SUBMITTED'), COORD, { text: 'No venue fits' }, 'REJECTED'],
    ['Planning → Reject → Rejected', ACTIONS.REJECT, evt('ARRANGEMENT_PENDING'), COORD, { text: 'Cannot be met' }, 'REJECTED'],
    ['Planning → Confirm → Confirmed', ACTIONS.CONFIRM, evt('ARRANGEMENT_PENDING'), COORD, { outstandingArrangements: [] }, 'CONFIRMED'],
    ['Confirmed → Significant change approved → Planning', ACTIONS.SIGNIFICANT_CHANGE_APPROVED, evt('CONFIRMED'), COORD, {}, 'ARRANGEMENT_PENDING'],
    ['Planning → Cancel → Cancelled', ACTIONS.CANCEL, evt('ARRANGEMENT_PENDING'), COORD, {}, 'CANCELLED'],
    ['Confirmed → Cancel → Cancelled', ACTIONS.CANCEL, evt('CONFIRMED'), COORD, {}, 'CANCELLED'],
    ['Confirmed → End time passes (system) → Completed', ACTIONS.COMPLETE, evt('CONFIRMED'), SYSTEM, { now: new Date('2026-11-20T10:00:01Z') }, 'COMPLETED'],
  ];
  for (const [name, action, entity, actor, extra, expectedTo] of rows) {
    await t.test(name, () => {
      const r = decide({ action, entity, actor, context: baseCtx(extra), text: extra.text });
      assert.equal(r.to, expectedTo);
      assert.equal(r.from, entity.status);
      assert.equal(r.activity.fromStatus, entity.status); // old status recorded
      assert.equal(r.activity.toStatus, expectedTo); // new status recorded
      assert.equal(r.activity.actorId, actor.id); // actor recorded
    });
  }
});

test('approve creates the Event in Planning and reserves nothing', () => {
  const r = decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx() });
  assert.equal(r.createsEvent, true);
  assert.equal(r.eventStatusAfter, 'ARRANGEMENT_PENDING');
  assert.notEqual(r.eventStatusAfter, 'CONFIRMED');
  assert.equal(r.outboxType, 'RequestApproved');
});

test('outbox event types', () => {
  const o = (action, entity, extra = {}) => decide({ action, entity, actor: COORD, context: baseCtx(extra), text: 'x' }).outboxType;
  assert.equal(o(ACTIONS.REJECT, req('SUBMITTED')), 'RequestRejected');
  assert.equal(o(ACTIONS.RETURN, req('SUBMITTED')), 'RequestReturned');
});

// ── one forbidden action for each status (→ 409, nothing changes) ─────────
test('forbidden action per status is a 409', async (t) => {
  const forbidden = [
    ['Draft cannot be approved (Draft → Approved directly)', ACTIONS.APPROVE, req('DRAFT'), COORD],
    ['Submitted cannot be resubmitted', ACTIONS.RESUBMIT, req('SUBMITTED'), ORG],
    ['Returned cannot be approved', ACTIONS.APPROVE, req('RETURNED_FOR_AMENDMENT'), COORD],
    ['Approved cannot be approved again (repeat approval)', ACTIONS.APPROVE, req('APPROVED'), COORD],
    ['Rejected request cannot be approved', ACTIONS.APPROVE, req('REJECTED'), COORD],
    ['Rejected request cannot be resubmitted', ACTIONS.RESUBMIT, req('REJECTED'), ORG],
    ['Planning cannot be approved', ACTIONS.APPROVE, evt('ARRANGEMENT_PENDING'), COORD],
    ['Confirmed cannot be rejected, only cancelled', ACTIONS.REJECT, evt('CONFIRMED'), COORD],
    ['Confirmed cannot be confirmed again', ACTIONS.CONFIRM, evt('CONFIRMED'), COORD],
    ['Cancelled (closed) cannot be cancelled again', ACTIONS.CANCEL, evt('CANCELLED'), COORD],
    ['Completed (closed) cannot be cancelled', ACTIONS.CANCEL, evt('COMPLETED'), COORD],
    ['Rejected event (closed) cannot be confirmed', ACTIONS.CONFIRM, evt('REJECTED'), COORD],
  ];
  for (const [name, action, entity, actor] of forbidden) {
    await t.test(name, () => {
      assert.throws(
        () => decide({ action, entity, actor, context: baseCtx({ outstandingArrangements: [] }), text: 'because' }),
        (e) => e instanceof InvalidTransitionError && e.status === 409 && e.code === 'INVALID_TRANSITION',
      );
    });
  }
});

// ── the wrong actor is refused for each action (→ 403) ───────────────────
test('wrong actor is a 403 for every action', async (t) => {
  const cases = [
    ['Submit by another organiser', ACTIONS.SUBMIT, req('DRAFT'), OTHER_ORG],
    ['Submit by a coordinator', ACTIONS.SUBMIT, req('DRAFT'), COORD],
    ['Approve by a different coordinator', ACTIONS.APPROVE, req('SUBMITTED'), OTHER_COORD],
    ['Approve by the organiser', ACTIONS.APPROVE, req('SUBMITTED'), ORG],
    ['Return by a different coordinator', ACTIONS.RETURN, req('SUBMITTED'), OTHER_COORD],
    ['Resubmit by another organiser', ACTIONS.RESUBMIT, req('RETURNED_FOR_AMENDMENT'), OTHER_ORG],
    ['Reject by a different coordinator', ACTIONS.REJECT, req('SUBMITTED'), OTHER_COORD],
    ['Confirm called directly by the organiser', ACTIONS.CONFIRM, evt('ARRANGEMENT_PENDING'), ORG],
    ['Significant change by a different coordinator', ACTIONS.SIGNIFICANT_CHANGE_APPROVED, evt('CONFIRMED'), OTHER_COORD],
    ['Cancel by the organiser', ACTIONS.CANCEL, evt('CONFIRMED'), ORG],
    ['Complete by a human coordinator (system only)', ACTIONS.COMPLETE, evt('CONFIRMED'), COORD],
  ];
  for (const [name, action, entity, actor] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => decide({ action, entity, actor, context: baseCtx({ outstandingArrangements: [], now: new Date('2026-11-21T00:00:00Z') }), text: 'x' }),
        (e) => e instanceof ForbiddenError && e.status === 403,
      );
    });
  }
});

test('403 wins over 409: a wrong actor learns nothing about the status', () => {
  assert.throws(
    () => decide({ action: ACTIONS.APPROVE, entity: req('REJECTED'), actor: OTHER_COORD, context: baseCtx() }),
    ForbiddenError,
  );
});

test('a multi-role user cannot decide on their own request', () => {
  const both = { id: 'org-1', roles: ['EVENT_ORGANISER', 'EVENT_COORDINATOR'] };
  assert.throws(
    () => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: both, context: baseCtx({ currentCoordinatorId: 'org-1' }) }),
    ForbiddenError,
  );
});

test('a user with the right id but not the coordinator role is refused', () => {
  const spoof = { id: 'coord-A', roles: ['ATTENDEE'] };
  assert.throws(() => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: spoof, context: baseCtx() }), ForbiddenError);
});

test('former coordinator loses access once the assignment moves (CS-30 30-04)', () => {
  // After reassignment A → B, the context's current coordinator is B.
  const ctx = baseCtx({ currentCoordinatorId: 'coord-B' });
  assert.throws(() => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: ctx }), ForbiddenError);
  assert.equal(decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: OTHER_COORD, context: ctx }).to, 'APPROVED');
});

test('unassigned request (no coordinator) cannot be approved by anyone', () => {
  assert.throws(
    () => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx({ currentCoordinatorId: null }) }),
    ForbiddenError,
  );
});

test('unknown action is rejected as a programming error', () => {
  assert.throws(() => decide({ action: 'TELEPORT', entity: req('DRAFT'), actor: ORG, context: baseCtx() }), /Unknown action/);
});

// ── reason / comments: whitespace, 1, 500, 501 (CS-28 28-05, 28-07) ──────
test('reason length boundary for reject and return', async (t) => {
  const cases = [
    ['whitespace only', '   \n ', false],
    ['missing', undefined, false],
    ['1 char', 'a', true],
    ['500 chars', 'a'.repeat(500), true],
    ['501 chars', 'a'.repeat(501), false],
    ['500 chars after trimming padding', `  ${'a'.repeat(500)}  `, true],
  ];
  for (const action of [ACTIONS.REJECT, ACTIONS.RETURN]) {
    for (const [name, text, ok] of cases) {
      await t.test(`${action}: ${name}`, () => {
        const call = () => decide({ action, entity: req('SUBMITTED'), actor: COORD, context: baseCtx(), text });
        if (ok) assert.equal(typeof call().activity.note, 'string');
        else assert.throws(call, (e) => e instanceof ValidationError && e.status === 422 && e.field === 'text');
      });
    }
  }
});

test('stored note is trimmed', () => {
  const r = decide({ action: ACTIONS.REJECT, entity: req('SUBMITTED'), actor: COORD, context: baseCtx(), text: '  no budget  ' });
  assert.equal(r.activity.note, 'no budget');
});

test('a decision on a closed request is 409 even with a valid reason', () => {
  assert.throws(
    () => decide({ action: ACTIONS.REJECT, entity: req('REJECTED'), actor: COORD, context: baseCtx(), text: 'again' }),
    InvalidTransitionError,
  );
});

test('approve notes are optional', () => {
  assert.equal(decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx() }).to, 'APPROVED');
});

// ── CS-12 12-06: approving around the event date ─────────────────────────
test('approve: event date yesterday / today / tomorrow (Singapore)', async (t) => {
  // "now" is 2026-10-10 12:00 in Singapore.
  const at = (isoDate) => ({ startAt: new Date(`${isoDate}T02:00:00Z`) }); // 10:00 SGT that day
  await t.test('yesterday is blocked (event passed)', () => {
    assert.throws(
      () => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx(at('2026-10-09')) }),
      (e) => e instanceof InvalidTransitionError && e.code === 'EVENT_DATE_PASSED',
    );
  });
  await t.test('today is approvable', () => {
    assert.equal(decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx(at('2026-10-10')) }).to, 'APPROVED');
  });
  await t.test('tomorrow is approvable', () => {
    assert.equal(decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: baseCtx(at('2026-10-11')) }).to, 'APPROVED');
  });
  await t.test('"today" follows the event time zone, not UTC', () => {
    // 2026-10-10 18:00 UTC is already 11 Oct in Singapore; an event on the 10th (SGT) has passed.
    const late = baseCtx({ now: new Date('2026-10-10T18:00:00Z'), startAt: new Date('2026-10-10T02:00:00Z') });
    assert.throws(() => decide({ action: ACTIONS.APPROVE, entity: req('SUBMITTED'), actor: COORD, context: late }), InvalidTransitionError);
  });
});

// ── CS-32 confirm preconditions (32-03, 32-06, 32-07) ────────────────────
test('confirm needs every arrangement complete', async (t) => {
  const call = (outstanding) => decide({ action: ACTIONS.CONFIRM, entity: evt('ARRANGEMENT_PENDING'), actor: COORD, context: baseCtx({ outstandingArrangements: outstanding }) });
  await t.test('n−1 of n complete: blocked, and the outstanding items are listed', () => {
    assert.throws(() => call(['equipment']), (e) => e.status === 409 && e.code === 'ARRANGEMENTS_INCOMPLETE' && e.details.outstanding[0] === 'equipment');
  });
  await t.test('none complete: blocked', () => {
    assert.throws(() => call(['venue', 'equipment', 'catering']), (e) => e.code === 'ARRANGEMENTS_INCOMPLETE' && e.details.outstanding.length === 3);
  });
  await t.test('n of n complete: allowed', () => assert.equal(call([]).to, 'CONFIRMED'));
  await t.test('checklist unknown (not supplied): blocked, never confirmed by accident', () => {
    assert.throws(() => decide({ action: ACTIONS.CONFIRM, entity: evt('ARRANGEMENT_PENDING'), actor: COORD, context: baseCtx() }), (e) => e.code === 'ARRANGEMENTS_INCOMPLETE');
  });
});

// ── cancellation window and completion timing ────────────────────────────
test('cancel is allowed until the event starts, not after', async (t) => {
  const call = (now) => decide({ action: ACTIONS.CANCEL, entity: evt('CONFIRMED'), actor: COORD, context: baseCtx({ now }) });
  await t.test('1 second before start', () => assert.equal(call(new Date('2026-11-20T00:59:59Z')).to, 'CANCELLED'));
  await t.test('at start', () => assert.throws(() => call(new Date('2026-11-20T01:00:00Z')), (e) => e.code === 'EVENT_STARTED'));
  await t.test('after start', () => assert.throws(() => call(new Date('2026-11-20T05:00:00Z')), (e) => e.status === 409));
});

test('Completed only once the end time has passed', () => {
  const call = (now) => decide({ action: ACTIONS.COMPLETE, entity: evt('CONFIRMED'), actor: SYSTEM, context: baseCtx({ now }) });
  assert.throws(() => call(new Date('2026-11-20T09:59:59Z')), (e) => e.code === 'EVENT_NOT_ENDED');
  assert.equal(call(new Date('2026-11-20T10:00:00Z')).to, 'COMPLETED');
});

// ── shared label map ─────────────────────────────────────────────────────
test('label map: one place for every screen', () => {
  assert.equal(REQUEST_LABELS.SUBMITTED, 'Under Review');
  assert.equal(EVENT_LABELS.ARRANGEMENT_PENDING, 'Planning');
  assert.equal(REQUEST_LABELS.RETURNED_FOR_AMENDMENT, 'Returned for Amendment');
});

test('displayStatus: approval shows Planning to the organiser, never Confirmed', () => {
  assert.equal(displayStatus({ requestStatus: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING' }), 'Planning');
  assert.equal(displayStatus({ requestStatus: 'SUBMITTED', eventStatus: null }), 'Under Review');
  assert.equal(displayStatus({ requestStatus: 'REJECTED', eventStatus: 'REJECTED' }), 'Rejected');
});

test('every status has a label', () => {
  for (const s of ['DRAFT', 'SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED', 'REJECTED']) assert.ok(REQUEST_LABELS[s], s);
  for (const s of ['ARRANGEMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'REJECTED']) assert.ok(EVENT_LABELS[s], s);
});
