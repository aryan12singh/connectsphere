// The transition guard (CS-32): the whole status table in ONE place.
//
// Handlers (approve, reject, return, resubmit, confirm, cancel, ...) never
// compare statuses themselves. They call decide(), which either returns what
// should change or throws. It touches no database, so it is easy to test and
// the handler can run it inside its own transaction.
//
// Check order (so the right code is returned and nothing leaks):
//   1. Is this actor allowed to do this action on this record?  → 403
//   2. Is the record in a status the action starts from?        → 409
//   3. Is the input valid (reason / comments)?                  → 422
//   4. Are the extra conditions met (dates, arrangements)?      → 409
// A 403 comes first on purpose: someone who may not act should not learn
// what status the record is in.

const ACTIONS = Object.freeze({
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  RETURN: 'RETURN',
  RESUBMIT: 'RESUBMIT',
  REJECT: 'REJECT',
  CONFIRM: 'CONFIRM',
  SIGNIFICANT_CHANGE_APPROVED: 'SIGNIFICANT_CHANGE_APPROVED',
  CANCEL: 'CANCEL',
  COMPLETE: 'COMPLETE',
});

const MAX_NOTE_LENGTH = 500; // placeholder max from CS-28, change here only

// ── Errors: each carries the HTTP status and a stable code ──────────────
class GuardError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}
class ForbiddenError extends GuardError {
  constructor(message = 'You are not allowed to do this') { super(403, 'FORBIDDEN', message); }
}
class InvalidTransitionError extends GuardError {
  constructor(message, code = 'INVALID_TRANSITION', details) { super(409, code, message, { details }); }
}
class ValidationError extends GuardError {
  constructor(field, message) { super(422, 'VALIDATION_FAILED', message, { field }); }
}

// ── The table ───────────────────────────────────────────────────────────
// scope  : which record the status lives on (REQUEST = EventRequest, EVENT = Event)
// from   : statuses the action may start from
// who    : OWNER (the owning Organiser) | COORDINATOR (the CURRENT one) | SYSTEM
// to     : the new status on that record
const TABLE = {
  [ACTIONS.SUBMIT]: [
    { scope: 'REQUEST', from: ['DRAFT'], who: 'OWNER', to: 'SUBMITTED' },
  ],
  [ACTIONS.APPROVE]: [
    // Creates the Event in Planning. Reserves nothing, never "Confirmed".
    { scope: 'REQUEST', from: ['SUBMITTED'], who: 'COORDINATOR', to: 'APPROVED',
      createsEvent: true, outbox: 'RequestApproved', check: 'eventNotPassed' },
  ],
  [ACTIONS.RETURN]: [
    { scope: 'REQUEST', from: ['SUBMITTED'], who: 'COORDINATOR', to: 'RETURNED_FOR_AMENDMENT',
      noteRequired: true, outbox: 'RequestReturned' },
  ],
  [ACTIONS.RESUBMIT]: [
    { scope: 'REQUEST', from: ['RETURNED_FOR_AMENDMENT'], who: 'OWNER', to: 'SUBMITTED', outbox: 'RequestResubmitted' },
  ],
  [ACTIONS.REJECT]: [
    // Two rows: before approval, or while the Event is still in Planning.
    // Confirmed events are NOT here: they can only be cancelled (CS-54).
    { scope: 'REQUEST', from: ['SUBMITTED'], who: 'COORDINATOR', to: 'REJECTED',
      noteRequired: true, outbox: 'RequestRejected' },
    { scope: 'EVENT', from: ['ARRANGEMENT_PENDING'], who: 'COORDINATOR', to: 'REJECTED',
      noteRequired: true, outbox: 'RequestRejected', alsoClosesRequest: true },
  ],
  [ACTIONS.CONFIRM]: [
    { scope: 'EVENT', from: ['ARRANGEMENT_PENDING'], who: 'COORDINATOR', to: 'CONFIRMED',
      check: 'arrangementsComplete' },
  ],
  [ACTIONS.SIGNIFICANT_CHANGE_APPROVED]: [
    { scope: 'EVENT', from: ['CONFIRMED'], who: 'COORDINATOR', to: 'ARRANGEMENT_PENDING' },
  ],
  [ACTIONS.CANCEL]: [
    { scope: 'EVENT', from: ['ARRANGEMENT_PENDING', 'CONFIRMED'], who: 'COORDINATOR', to: 'CANCELLED',
      check: 'beforeStart' },
  ],
  [ACTIONS.COMPLETE]: [
    { scope: 'EVENT', from: ['CONFIRMED'], who: 'SYSTEM', to: 'COMPLETED', check: 'afterEnd' },
  ],
};

// ── Who is allowed ──────────────────────────────────────────────────────
function actorMatches(who, actor, ctx) {
  const roles = actor.roles || [];
  if (who === 'SYSTEM') return actor.system === true;
  if (actor.system) return false; // the system never acts as a person
  if (!actor.id) return false;
  if (who === 'OWNER') {
    return roles.includes('EVENT_ORGANISER') && actor.id === ctx.organiserId;
  }
  if (who === 'COORDINATOR') {
    // Only the CURRENT coordinator, and never on their own request, which a
    // multi-role account (Organiser + Coordinator) could otherwise approve.
    return roles.includes('EVENT_COORDINATOR')
      && ctx.currentCoordinatorId != null
      && actor.id === ctx.currentCoordinatorId
      && actor.id !== ctx.organiserId;
  }
  return false;
}

// ── Extra conditions (step 4) ───────────────────────────────────────────
// "Today" means today in the EVENT's time zone, not the server's.
function localDate(instant, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

const CHECKS = {
  eventNotPassed(ctx) {
    if (localDate(ctx.startAt, ctx.timeZone) < localDate(ctx.now, ctx.timeZone)) {
      throw new InvalidTransitionError('The event date has passed', 'EVENT_DATE_PASSED');
    }
  },
  arrangementsComplete(ctx) {
    // Unknown checklist = blocked. We never confirm by accident.
    const outstanding = Array.isArray(ctx.outstandingArrangements) ? ctx.outstandingArrangements : null;
    if (outstanding === null || outstanding.length > 0) {
      throw new InvalidTransitionError('Not all arrangements are complete', 'ARRANGEMENTS_INCOMPLETE', { outstanding: outstanding || ['unknown'] });
    }
  },
  beforeStart(ctx) {
    if (ctx.now >= ctx.startAt) throw new InvalidTransitionError('The event has already started', 'EVENT_STARTED');
  },
  afterEnd(ctx) {
    if (ctx.now < ctx.endAt) throw new InvalidTransitionError('The event has not ended yet', 'EVENT_NOT_ENDED');
  },
};

function cleanNote(text) {
  const note = typeof text === 'string' ? text.trim() : '';
  if (note.length === 0) throw new ValidationError('text', 'A reason or comment is required');
  if (note.length > MAX_NOTE_LENGTH) throw new ValidationError('text', `Must be at most ${MAX_NOTE_LENGTH} characters`);
  return note;
}

/**
 * Decides whether `actor` may do `action` to `entity`, and what changes.
 *
 * @param action  one of ACTIONS
 * @param entity  { scope: 'REQUEST' | 'EVENT', status }  the record being changed
 * @param actor   { id, roles: [...] }  or { system: true } for the clock
 * @param context { organiserId, currentCoordinatorId, startAt, endAt, timeZone,
 *                  now, outstandingArrangements? }  facts the rules need
 * @param text    reason (reject) or comments (return)
 * @returns what to write: { action, scope, from, to, createsEvent, outboxType,
 *          closesRequest, activity: { fromStatus, toStatus, actorId, actorType, note } }
 * @throws ForbiddenError (403) | InvalidTransitionError (409) | ValidationError (422)
 */
function decide({ action, entity, actor, context, text }) {
  const rows = TABLE[action];
  if (!rows) throw new Error(`Unknown action: ${action}`);

  // Only rows about this kind of record (a REJECT has one row per scope).
  const candidates = rows.filter((row) => row.scope === entity.scope);

  // 1. Who: the action must be open to this actor on this record.
  const whoRows = candidates.length ? candidates : rows;
  if (!whoRows.some((row) => actorMatches(row.who, actor, context))) throw new ForbiddenError();

  // 2. Status: the record must be somewhere the action can start from.
  const row = candidates.find((r) => r.from.includes(entity.status));
  if (!row) {
    throw new InvalidTransitionError(`Cannot ${action.toLowerCase().replace(/_/g, ' ')} when the status is ${entity.status}`);
  }

  // 3. Input.
  const note = row.noteRequired ? cleanNote(text) : (typeof text === 'string' && text.trim() ? text.trim().slice(0, MAX_NOTE_LENGTH) : null);

  // 4. Extra conditions.
  if (row.check) CHECKS[row.check](context);

  return {
    action,
    scope: row.scope,
    from: entity.status,
    to: row.to,
    createsEvent: Boolean(row.createsEvent),
    eventStatusAfter: row.createsEvent ? 'ARRANGEMENT_PENDING' : undefined,
    closesRequest: row.to === 'REJECTED',
    alsoClosesRequest: Boolean(row.alsoClosesRequest),
    outboxType: row.outbox || null,
    activity: {
      fromStatus: entity.status,
      toStatus: row.to,
      actorId: actor.system ? null : actor.id,
      actorType: actor.system ? 'SYSTEM' : 'USER',
      note,
    },
  };
}

module.exports = { decide, ACTIONS, TABLE, MAX_NOTE_LENGTH, GuardError, ForbiddenError, InvalidTransitionError, ValidationError };
