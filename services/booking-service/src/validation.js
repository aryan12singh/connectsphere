const STATUSES = ['AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED'];

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function validateBooking(body, partial = false) {
  const errors = {};
  const required = ['venueId', 'title', 'reason', 'startAt', 'endAt', 'timeZone'];
  if (!partial) for (const key of required) if (body?.[key] === undefined) errors[key] = ['This field is required'];
  if (body?.venueId !== undefined && !text(body.venueId)) errors.venueId = ['Venue is required'];
  if (body?.title !== undefined && !text(body.title)) errors.title = ['Title is required'];
  if (body?.reason !== undefined && !text(body.reason)) errors.reason = ['Reason is required'];
  if (body?.timeZone !== undefined && !text(body.timeZone)) errors.timeZone = ['Time zone is required'];
  if (body?.startAt !== undefined && Number.isNaN(Date.parse(body.startAt))) errors.startAt = ['Start time must be an ISO date-time'];
  if (body?.endAt !== undefined && Number.isNaN(Date.parse(body.endAt))) errors.endAt = ['End time must be an ISO date-time'];
  if (body?.startAt && body?.endAt && !Number.isNaN(Date.parse(body.startAt)) && !Number.isNaN(Date.parse(body.endAt)) && Date.parse(body.startAt) >= Date.parse(body.endAt)) errors.endAt = ['End time must be after start time'];
  if (body?.status !== undefined && !STATUSES.includes(body.status)) errors.status = ['Unknown booking status'];
  return errors;
}

module.exports = { STATUSES, validateBooking, text };
