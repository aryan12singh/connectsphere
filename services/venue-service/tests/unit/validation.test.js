const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVenue, normaliseVenue, validateHours } = require('../../src/validation');

const REQUIRED_PHYSICAL_FIELDS = [
  'name', 'venueType', 'supportedLayouts', 'facilities',
  'accessibilityTags', 'timeZone', 'managedById', 'reason', 'operatingHours', 'address', 'capacity',
];

function validPhysicalVenue(overrides = {}) {
  return {
    name: 'Marina Convention Centre',
    address: '18 Bayfront Link',
    capacity: 200,
    venueType: 'PHYSICAL',
    supportedLayouts: ['THEATRE', 'CLASSROOM'],
    facilities: ['PROJECTOR', 'PA_SYSTEM'],
    accessibilityTags: ['WHEELCHAIR_ACCESS'],
    operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '18:00' }],
    timeZone: 'Asia/Singapore',
    managedById: 'venue-staff-1',
    reason: 'Initial venue setup',
    ...overrides,
  };
}

test('CS-venue-VAL-01: physical venue creation requires all captured fields and a reason', () => {
  const errors = validateVenue({});

  assert.deepEqual(Object.keys(errors).sort(), REQUIRED_PHYSICAL_FIELDS.sort());
  for (const field of REQUIRED_PHYSICAL_FIELDS) {
    assert.deepEqual(errors[field], ['This field is required'], `missing field guidance for ${field}`);
  }
});

test('CS-venue-VAL-02: virtual venues conditionally omit physical address and capacity', () => {
  const errors = validateVenue(validPhysicalVenue({
    venueType: 'VIRTUAL',
    address: undefined,
    capacity: undefined,
  }));

  assert.deepEqual(errors, {});
});

test('CS-venue-VAL-02c: a virtual venue may provide an empty address because it is not physical', () => {
  const errors = validateVenue(validPhysicalVenue({
    venueType: 'VIRTUAL',
    address: '',
    capacity: undefined,
  }));

  assert.deepEqual(errors, {});
});

test('CS-venue-VAL-02b: a supplied virtual capacity must still be a positive integer', () => {
  const errors = validateVenue(validPhysicalVenue({
    venueType: 'VIRTUAL',
    address: undefined,
    capacity: 0,
  }));

  assert.deepEqual(errors, { capacity: ['Capacity must be a positive integer'] });
});

test('CS-venue-VAL-03: physical capacity must be positive and layouts must use the supported values', () => {
  const errors = validateVenue(validPhysicalVenue({
    capacity: 0,
    supportedLayouts: ['BANQUET'],
  }));

  assert.deepEqual(errors.capacity, ['Capacity must be a positive integer']);
  assert.deepEqual(errors.supportedLayouts, ['Supported layouts contain an unknown value']);
});

test('CS-venue-VAL-04: a blank change reason is invalid even when venue details are valid', () => {
  const errors = validateVenue(validPhysicalVenue({ reason: '   ' }));

  assert.deepEqual(errors, { reason: ['Reason is required'] });
});

test('CS-venue-VAL-04b: invalid supplied venue values receive field-level guidance', () => {
  const errors = validateVenue(validPhysicalVenue({
    name: '',
    address: '',
    venueType: 'POP_UP',
    supportedLayouts: 'THEATRE',
    timeZone: '   ',
    managedById: '   ',
  }));

  assert.deepEqual(errors, {
    name: ['Name is required'],
    address: ['Address is required for non-virtual venues'],
    venueType: ['Unknown venue type'],
    supportedLayouts: ['Supported layouts contain an unknown value'],
    timeZone: ['Time zone is required'],
    managedById: ['A venue staff manager is required'],
  });
});

test('CS-venue-VAL-09: POST and PUT venue payloads reject empty operating hours', () => {
  assert.deepEqual(validateVenue(validPhysicalVenue({ operatingHours: [] })), {
    operatingHours: ['At least one operating hour is required'],
  });
});

test('CS-venue-VAL-10: POST and PUT venue payloads reject null operating hours', () => {
  assert.deepEqual(validateVenue(validPhysicalVenue({ operatingHours: null })), {
    operatingHours: ['At least one operating hour is required'],
  });
});

test('CS-venue-DATA-01: venue input preserves selected facilities and accessibility while trimming text', () => {
  const normalized = normaliseVenue(validPhysicalVenue({
    name: '  Hall A ',
    address: '  1 Main Street ',
    supportedLayouts: ['THEATRE', ''],
    facilities: ['PROJECTOR', 'PA_SYSTEM'],
    accessibilityTags: ['WHEELCHAIR_ACCESS'],
    reason: '  Renovated for accessibility ',
  }));

  assert.equal(normalized.name, 'Hall A');
  assert.equal(normalized.address, '1 Main Street');
  assert.deepEqual(normalized.supportedLayouts, ['THEATRE']);
  assert.deepEqual(normalized.facilities, ['PROJECTOR', 'PA_SYSTEM']);
  assert.deepEqual(normalized.accessibilityTags, ['WHEELCHAIR_ACCESS']);
  assert.equal(normalized.reason, 'Renovated for accessibility');
});

test('CS-venue-DATA-01b: venue defaults time zone and active state when those optional defaults are omitted', () => {
  const normalized = normaliseVenue(validPhysicalVenue({
    timeZone: '   ',
    isActive: false,
  }));

  assert.equal(normalized.timeZone, 'Asia/Singapore');
  assert.equal(normalized.isActive, false);
});

test('CS-venue-VAL-05: operating hours accept valid HH:mm values and reject invalid weekday/time values', () => {
  assert.deepEqual(validateHours([
    { weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '18:30' },
  ]), {});

  assert.deepEqual(validateHours([
    { weekday: 'FUNDAY', isClosed: false, opensAt: '9:00', closesAt: '18:00' },
  ]), {
    'operatingHours.0.weekday': ['Unknown weekday'],
    'operatingHours.0.time': ['Open and close times must use HH:mm'],
  });
});

test('CS-venue-VAL-06: closed operating hours do not require open and close times', () => {
  assert.deepEqual(validateHours([
    { weekday: 'SUNDAY', isClosed: true },
  ]), {});
  assert.deepEqual(validateHours('not-an-array'), {
    operatingHours: ['Expected an array'],
  });
});

test('CS-venue-VAL-07: an empty operating-hours list is rejected with field-level guidance', () => {
  assert.deepEqual(validateHours([]), {
    operatingHours: ['At least one operating hour is required'],
  });
});

test('CS-venue-VAL-08: null operating hours are rejected with field-level guidance', () => {
  assert.deepEqual(validateHours(null), {
    operatingHours: ['At least one operating hour is required'],
  });
});
