const STATUSES = ['AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED'];
const { instant } = require('./time');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function validateBooking(body, partial = false) {
  const errors = {};
  const operational=['BLOCKED','UNAVAILABLE'].includes(body?.status) || body?.status==='CANCELLED' && !body.eventId;
  const required = ['venueId', 'title', 'reason', 'startAt', 'endAt', 'timeZone'];
  if (!partial) for (const key of required) if (body?.[key] === undefined) errors[key] = ['This field is required'];
  if (body?.venueId !== undefined && !text(body.venueId)) errors.venueId = ['Venue is required'];
  if (body?.title !== undefined && !text(body.title)) errors.title = ['Title is required'];
  if (body?.reason !== undefined && !text(body.reason)) errors.reason = ['Reason is required'];
  if (body?.timeZone !== undefined && !text(body.timeZone)) errors.timeZone = ['Time zone is required'];
  for(const field of ['startAt','endAt']) if (body?.[field]!==undefined) {
    try { instant(body[field],field); }
    catch {errors[field]=[`${field==='startAt'?'Start':'End'} time must be an ISO date-time`];}
  }
  if (body?.startAt && body?.endAt && !Number.isNaN(Date.parse(body.startAt)) && !Number.isNaN(Date.parse(body.endAt)) && Date.parse(body.startAt) >= Date.parse(body.endAt)) errors.endAt = ['End time must be after start time'];
  if (body?.status !== undefined && !STATUSES.includes(body.status)) errors.status = ['Unknown booking status'];
  for(const field of ['facilities','accessibilityNeeds']) if(body?.[field]!==undefined && (!Array.isArray(body[field]) || body[field].some(value=>typeof value!=='string' || !value.trim()))) errors[field]=['Use a list of non-empty requirement codes'];
  if (body?.required!==undefined && body.required!==true) errors.required=['All current venue arrangements are required under the working readiness policy'];
  if (body?.expectedAttendance!==undefined && !(operational && body.expectedAttendance===null) && (!Number.isSafeInteger(body.expectedAttendance) || body.expectedAttendance<1 || body.expectedAttendance>2147483647)) errors.expectedAttendance=['Use a positive whole attendance'];
  if (body?.layout!==undefined && !(operational && body.layout===null) && !text(body.layout)) errors.layout=['Select a room layout'];
  if (body?.timeZone!==undefined && text(body.timeZone)) try { new Intl.DateTimeFormat('en',{timeZone:body.timeZone}); } catch {errors.timeZone=['Use a valid IANA time zone'];}
  return errors;
}

module.exports = { STATUSES, validateBooking, text };
