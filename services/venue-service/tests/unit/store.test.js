const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const store = require('../../src/store');

const ACTOR = { id: 'venue-staff-1', role: 'VENUE_STAFF' };

function venueInput(overrides = {}) {
  return {
    name: 'Marina Convention Centre',
    address: '18 Bayfront Link',
    capacity: 200,
    venueType: 'PHYSICAL',
    supportedLayouts: ['THEATRE'],
    facilities: ['PROJECTOR'],
    accessibilityTags: ['WHEELCHAIR_ACCESS'],
    operatingHours: [{ weekday: 'MONDAY', opensAt: '09:00', closesAt: '18:00', isClosed: false }],
    timeZone: 'Asia/Singapore',
    isActive: true,
    managedById: 'venue-staff-1',
    reason: 'Initial venue setup',
    ...overrides,
  };
}

test.beforeEach(() => store.reset());
test.after(() => store.reset());

test('CS-venue-INFRA-01: production configuration defaults to Prisma persistence', () => {
  const result = spawnSync(process.execPath, ['-e', "delete process.env.DATA_MODE; process.env.DATABASE_URL='postgresql://test'; process.env.NODE_ENV='production'; process.stdout.write(require('./src/config').dataMode)"], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'prisma');
});

test('CS-venue-DATA-02: creating a venue persists captured fields and records the creating actor and reason', () => {
  const venue = store.createVenue(venueInput(), ACTOR);

  assert.equal(store.getVenue(venue.id).name, 'Marina Convention Centre');
  assert.equal(store.getVenue(venue.id).capacity, 200);
  assert.deepEqual(store.getVenue(venue.id).supportedLayouts, ['THEATRE']);
  assert.deepEqual(store.getVenue(venue.id).facilities, ['PROJECTOR']);
  assert.deepEqual(store.getVenue(venue.id).accessibilityTags, ['WHEELCHAIR_ACCESS']);
  assert.equal(store.getVenue(venue.id).operatingHours[0].weekday, 'MONDAY');
  assert.equal(store.listVenues().length, 1);

  const [history] = store.listHistory(venue.id);
  assert.equal(history.action, 'VENUE_CREATED');
  assert.equal(history.actorId, 'venue-staff-1');
  assert.equal(history.actorRole, 'VENUE_STAFF');
  assert.equal(history.reason, 'Initial venue setup');
});

test('CS-venue-DATA-03: replacing a venue updates its fields and appends actor history', () => {
  const venue = store.createVenue(venueInput(), ACTOR);
  const updated = store.replaceVenue(venue.id, venueInput({ capacity: 350, reason: 'Capacity increased' }), {
    id: 'technical-support-1',
    role: 'TECHNICAL_SUPPORT_STAFF',
  });

  assert.equal(updated.capacity, 350);
  assert.equal(updated.operatingHours[0].weekday, 'MONDAY');
  const [history] = store.listHistory(venue.id);
  assert.equal(history.action, 'VENUE_UPDATED');
  assert.equal(history.actorId, 'technical-support-1');
  assert.equal(history.reason, 'Capacity increased');
});

test('CS-venue-DATA-04: operating-hour replacement persists hours and creates history', () => {
  const venue = store.createVenue(venueInput(), ACTOR);
  const hours = store.setOperatingHours(venue.id, [
    { weekday: 'MONDAY', opensAt: '09:00', closesAt: '18:00', isClosed: false },
  ], ACTOR, 'Published operating hours');

  assert.equal(hours.length, 1);
  assert.match(hours[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(store.getVenue(venue.id).operatingHours[0].weekday, 'MONDAY');
  assert.equal(store.listHistory(venue.id)[0].action, 'OPERATING_HOURS_UPDATED');
});

test('CS-venue-DATA-04b: supplied operating-hour IDs are preserved on replacement', () => {
  const venue = store.createVenue(venueInput({ isActive: false }), ACTOR);
  const hours = store.setOperatingHours(venue.id, [
    { id: 'hours-1', weekday: 'TUESDAY', opensAt: '10:00', closesAt: '17:00', isClosed: false },
  ], ACTOR, 'Updated hours');

  assert.equal(hours[0].id, 'hours-1');
  assert.equal(store.getVenue(venue.id).isActive, false);
});

test('CS-venue-DATA-05: unknown venue IDs do not create or update records', () => {
  assert.equal(store.getVenue('missing-venue'), null);
  assert.equal(store.replaceVenue('missing-venue', venueInput(), ACTOR), null);
  assert.equal(store.setOperatingHours('missing-venue', [], ACTOR, 'No venue'), null);
  assert.deepEqual(store.listHistory('missing-venue'), []);
});
