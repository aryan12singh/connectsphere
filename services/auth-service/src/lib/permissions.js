// The list of every permission the system knows about, and which ones are
// protected.
//
// Why the list lives in code: a permission only means something if some
// route checks it. Tech support can change WHICH ROLES have each permission
// (stored in auth_db.role_permissions), but can't invent new permissions —
// a developer adds one here when they add a route that checks it.
//
// Naming: "<area>.<action>". Keep descriptions short; the admin screen shows them.

const PERMISSIONS = Object.freeze({
  // Admin (tech support)
  'users.view': 'See the list of users',
  'users.manage': 'Create users, change roles, disable or re-enable accounts',
  'permissions.manage': 'Change which permissions each role has',
  'settings.manage': 'Change login and password settings',
  'audit.view': 'See the admin audit log',

  // Event requests and events
  'event_requests.create': 'Submit event requests',
  'event_requests.review': 'Approve or reject event requests',
  'events.view': 'See events',
  'events.confirm': 'Confirm events once arrangements are ready',

  // Venues and bookings
  'venues.view': 'See venues',
  'venues.manage': 'Add and edit venues',
  'venue_bookings.create': 'Request venue bookings',
  'venue_bookings.decide': 'Approve or reject venue bookings',

  // Attendance and messaging
  'attendance.register': 'Register for events',
  'messages.send': 'Send messages in event threads',
});

// The fixed roles (they match the UserRole enum in user-service).
const ROLES = Object.freeze([
  'EVENT_ORGANISER',
  'EVENT_COORDINATOR',
  'VENUE_STAFF',
  'TECHNICAL_SUPPORT_STAFF',
  'ATTENDEE',
]);

// Tech support always keeps these, so nobody can accidentally lock every
// admin out of the admin screens.
const PROTECTED = Object.freeze({
  TECHNICAL_SUPPORT_STAFF: ['users.manage', 'permissions.manage'],
});

function isKnownPermission(permission) {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, permission);
}

module.exports = { PERMISSIONS, ROLES, PROTECTED, isKnownPermission };
