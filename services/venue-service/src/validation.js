const VENUE_TYPES = ['PHYSICAL', 'VIRTUAL', 'HYBRID'];
const LAYOUTS = ['THEATRE', 'CLASSROOM', 'CABARET'];
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const config = require('./config');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function array(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function validateVenue(body, partial = false) {
  const errors = {};
  const required = ['name', 'venueType', 'supportedLayouts', 'facilities', 'accessibilityTags', 'timeZone', 'managedById', 'reason', 'operatingHours'];
  if (body?.venueType !== 'VIRTUAL') required.push('address', 'capacity');
  if (!partial) {
    for (const key of required) if (body?.[key] === undefined) errors[key] = ['This field is required'];
  }
  if (body?.name !== undefined && !text(body.name)) errors.name = ['Name is required'];
  if (body?.address !== undefined && !text(body.address) && body.venueType !== 'VIRTUAL') errors.address = ['Address is required for non-virtual venues'];
  if (body?.capacity === null && body.venueType !== 'VIRTUAL') errors.capacity = ['Capacity must be a positive integer'];
  if (body?.capacity !== undefined && body?.capacity !== null && (!Number.isInteger(body.capacity) || body.capacity <= 0)) errors.capacity = ['Capacity must be a positive integer'];
  if (body?.capacity !== undefined && body?.capacity !== null && Number.isInteger(body.capacity) && body.capacity > config.maxVenueCapacity) {
    errors.capacity = [`Capacity must not exceed ${config.maxVenueCapacity}`];
  }
  if (body?.venueType !== undefined && !VENUE_TYPES.includes(body.venueType)) errors.venueType = ['Unknown venue type'];
  if (body?.supportedLayouts !== undefined && (!Array.isArray(body.supportedLayouts) || body.supportedLayouts.some((item) => typeof item !== 'string' || !item.trim() || !LAYOUTS.includes(item.trim())))) errors.supportedLayouts = ['Supported layouts contain an unknown value'];
  if (body?.facilities !== undefined && (!Array.isArray(body.facilities) || body.facilities.some((item) => typeof item !== 'string' || !item.trim()))) errors.facilities = ['Facilities must contain only non-empty strings'];
  if (body?.accessibilityTags !== undefined && (!Array.isArray(body.accessibilityTags) || body.accessibilityTags.some((item) => typeof item !== 'string' || !item.trim()))) errors.accessibilityTags = ['Accessibility tags must contain only non-empty strings'];
  if (body?.timeZone !== undefined && !text(body.timeZone)) errors.timeZone = ['Time zone is required'];
  if (body?.managedById !== undefined && !text(body.managedById)) errors.managedById = ['A venue staff manager is required'];
  if (body?.reason !== undefined && !text(body.reason)) errors.reason = ['Reason is required'];
  if (body?.operatingHours !== undefined) Object.assign(errors, validateHours(body.operatingHours));
  return errors;
}

function normaliseHours(hours) {
  return hours.map((hour) => ({
    ...(text(hour.id) ? { id: text(hour.id) } : {}),
    weekday: hour.weekday,
    isClosed: hour.isClosed === true,
    opensAt: text(hour.opensAt) || null,
    closesAt: text(hour.closesAt) || null,
  }));
}

function normaliseVenue(body) {
  return {
    name: text(body.name),
    address: text(body.address) || null,
    capacity: body.capacity,
    venueType: body.venueType,
    supportedLayouts: array(body.supportedLayouts),
    facilities: array(body.facilities),
    accessibilityTags: array(body.accessibilityTags),
    timeZone: text(body.timeZone) || 'Asia/Singapore',
    isActive: body.isActive !== false,
    managedById: text(body.managedById),
    reason: text(body.reason),
    operatingHours: normaliseHours(body.operatingHours),
  };
}

function validateHours(body) {
  const errors = {};
  if (body === null || body === undefined || (Array.isArray(body) && body.length === 0)) {
    return { operatingHours: ['At least one operating hour is required'] };
  }
  if (!Array.isArray(body)) return { operatingHours: ['Expected an array'] };
  for (const [index, item] of body.entries()) {
    if (!WEEKDAYS.includes(item?.weekday)) errors[`operatingHours.${index}.weekday`] = ['Unknown weekday'];
    if (item?.isClosed !== true && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item?.opensAt || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item?.closesAt || ''))) {
      errors[`operatingHours.${index}.time`] = ['Open and close times must use HH:mm'];
    }
  }
  const weekdays = body.map((item) => item?.weekday).filter(Boolean);
  if (new Set(weekdays).size !== weekdays.length) errors.operatingHours = ['Each weekday may appear only once'];
  return errors;
}

module.exports = { VENUE_TYPES, LAYOUTS, WEEKDAYS, text, validateVenue, normaliseVenue, validateHours };
