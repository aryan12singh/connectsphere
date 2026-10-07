// Input checks for booking requests. Every value from the caller is checked
// for type, shape and length before it is used, so nothing unexpected (huge
// strings, control characters, objects where text belongs, made-up ids)
// reaches the database or other services. Database access itself always goes
// through Prisma, which sends values as query parameters, never as SQL text.

const STATUSES = ['AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Event ids are UUIDs from event-service; the mock event store uses "req-xxxx".
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
// ISO 8601 with a time zone offset, as docs/api-contract.md §3 requires:
// 2026-11-20T09:00:00+08:00 or 2026-11-20T01:00:00.000Z
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,100}$/;
// Control characters (except tab and newline in longer text).
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

const MAX_TITLE = 200;
const MAX_REASON = 500;

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function isValidTimeZone(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isIsoInstant(value) {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value) && !Number.isNaN(Date.parse(value));
}

// Same instant always gives the same text, e.g. "+08:00" and "Z" forms.
function toIsoInstant(value) {
  return new Date(value).toISOString();
}

function checkText(errors, field, value, max, label) {
  if (typeof value !== 'string' || !value.trim()) errors[field] = [`${label} is required`];
  else if (value.length > max) errors[field] = [`${label} must be ${max} characters or fewer`];
  else if (CONTROL_CHARS.test(value)) errors[field] = [`${label} contains characters that are not allowed`];
}

/**
 * Checks a full booking (create, or a coordinator editing their booking).
 * Returns { field: [messages] }; empty when valid.
 */
function validateBooking(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: ['Expected a JSON object'] };

  if (typeof body.venueId !== 'string' || !UUID.test(body.venueId)) errors.venueId = ['Venue is required'];
  if (body.eventId !== undefined && body.eventId !== null && body.eventId !== '') {
    if (typeof body.eventId !== 'string' || !EVENT_ID.test(body.eventId)) errors.eventId = ['Event id is not valid'];
  }
  checkText(errors, 'title', body.title, MAX_TITLE, 'Title');
  checkText(errors, 'reason', body.reason, MAX_REASON, 'Reason');
  if (!isValidTimeZone(body.timeZone)) errors.timeZone = ['Time zone must be an IANA name such as Asia/Singapore'];
  if (!isIsoInstant(body.startAt)) errors.startAt = ['Start time must be an ISO date-time with a time zone offset'];
  if (!isIsoInstant(body.endAt)) errors.endAt = ['End time must be an ISO date-time with a time zone offset'];
  if (!errors.startAt && !errors.endAt && Date.parse(body.startAt) >= Date.parse(body.endAt)) {
    errors.endAt = ['End time must be after start time'];
  }
  if (body.status !== undefined && !STATUSES.includes(body.status)) errors.status = ['Unknown booking status'];
  return errors;
}

/** Checks a Venue Staff status change: { status, reason }. */
function validateStatusChange(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: ['Expected a JSON object'] };
  if (!STATUSES.includes(body.status)) errors.status = ['Unknown booking status'];
  checkText(errors, 'reason', body.reason, MAX_REASON, 'Reason');
  return errors;
}

/** Checks optional query filters. Each must be a single, well-formed value. */
function validateQuery(query) {
  const errors = {};
  if (query.venueId !== undefined && (typeof query.venueId !== 'string' || !UUID.test(query.venueId))) {
    errors.venueId = ['Venue id is not valid'];
  }
  if (query.eventId !== undefined && (typeof query.eventId !== 'string' || !EVENT_ID.test(query.eventId))) {
    errors.eventId = ['Event id is not valid'];
  }
  if (query.status !== undefined) {
    const values = typeof query.status === 'string' ? query.status.split(',') : [];
    if (!values.length || values.some((value) => !STATUSES.includes(value))) errors.status = ['Unknown booking status'];
  }
  for (const field of ['startAt', 'endAt']) {
    if (query[field] !== undefined && !isIsoInstant(query[field])) {
      errors[field] = [`${field === 'startAt' ? 'Start' : 'End'} time must be an ISO date-time with a time zone offset`];
    }
  }
  if (!errors.startAt && !errors.endAt && query.startAt && query.endAt && Date.parse(query.startAt) >= Date.parse(query.endAt)) {
    errors.endAt = ['End time must be after start time'];
  }
  return errors;
}

function isValidIdempotencyKey(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value);
}

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

module.exports = {
  STATUSES,
  text,
  validateBooking,
  validateStatusChange,
  validateQuery,
  isValidIdempotencyKey,
  isUuid,
  toIsoInstant,
};
