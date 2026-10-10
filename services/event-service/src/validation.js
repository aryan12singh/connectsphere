const REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED', 'REJECTED'];

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function offsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', timeZoneName: 'longOffset' }).formatToParts(date);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = value.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function parseLocalDateTime(dateText, timeText, timeZone) {
  const date = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = String(timeText || '').match(/^(\d{2}):(\d{2})$/);
  if (!date || !clock) return null;
  const naive = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(clock[1]), Number(clock[2]));
  return new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
}

function parseInstant(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normaliseInput(body = {}) {
  const timeZone = text(body.timeZone);
  const startAt = parseInstant(body.startAt) || parseLocalDateTime(body.proposedDate, body.startTime, timeZone);
  const endAt = parseInstant(body.endAt) || parseLocalDateTime(body.proposedDate, body.endTime, timeZone);
  return {
    eventName: text(body.eventName),
    purpose: body.purpose == null ? null : text(body.purpose),
    description: body.description == null ? null : text(body.description),
    startAt,
    endAt,
    timeZone: timeZone || null,
    expectedAttendance: body.expectedAttendance == null || body.expectedAttendance === '' ? null : Number(body.expectedAttendance),
    minimumCapacity: body.minimumCapacity == null || body.minimumCapacity === '' ? null : Number(body.minimumCapacity),
    preferredLayout: body.preferredLayout == null ? null : text(body.preferredLayout),
    venueType: body.venueType == null ? null : text(body.venueType),
    venueRequirements: body.venueRequirements == null ? null : text(body.venueRequirements),
    accessibilityNeeds: Array.isArray(body.accessibilityNeeds) ? body.accessibilityNeeds.filter((value) => typeof value === 'string') : [],
    accessibilityDetails: body.accessibilityDetails == null ? null : text(body.accessibilityDetails),
    equipmentNeeds: Array.isArray(body.equipmentNeeds) ? body.equipmentNeeds.filter((value) => typeof value === 'string') : [],
    technicalDetails: body.technicalDetails == null ? null : text(body.technicalDetails),
  };
}

function validate(fields, complete = false) {
  const errors = {};
  if (fields.eventName.length > 200) errors.eventName = 'Event name must be at most 200 characters.';
  if (fields.purpose && fields.purpose.length > 200) errors.purpose = 'Purpose must be at most 200 characters.';
  if (fields.description && fields.description.length > 2000) errors.description = 'Description must be at most 2000 characters.';
  if (fields.expectedAttendance != null && (!Number.isInteger(fields.expectedAttendance) || fields.expectedAttendance < 1)) errors.expectedAttendance = 'Expected attendance must be positive.';
  if (fields.minimumCapacity != null && (!Number.isInteger(fields.minimumCapacity) || fields.minimumCapacity < 1)) errors.minimumCapacity = 'Minimum capacity must be positive.';
  if (fields.startAt && fields.endAt && fields.endAt <= fields.startAt) errors.endAt = 'End date and time must be after the start.';
  if (complete) {
    if (!fields.eventName) errors.eventName = 'Event name is required.';
    if (!fields.startAt) errors.startAt = 'Start date and time must be a valid ISO date-time.';
    if (!fields.endAt) errors.endAt = 'End date and time must be a valid ISO date-time.';
    if (!fields.timeZone) errors.timeZone = 'Time zone is required.';
    if (!Number.isInteger(fields.expectedAttendance) || fields.expectedAttendance < 1) errors.expectedAttendance = 'Expected attendance must be positive.';
    if (!fields.venueType) errors.venueType = 'Venue type is required.';
  }
  return Object.keys(errors).length ? errors : null;
}

module.exports = { REQUEST_STATUSES, text, normaliseInput, validate, parseLocalDateTime };
