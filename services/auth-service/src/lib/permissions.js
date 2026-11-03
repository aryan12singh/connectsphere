// The list of every permission the system knows about.
//
// Why the list lives in code: a permission only means something if some
// route checks it. Which roles have each permission is seeded in
// auth_db.role_permissions by migrations; there is no in-app editor
// (CS-10, CS-24 T02). A developer adds one here when they add a route that
// checks it.
//
// Naming: "<area>.<action>".

const PERMISSIONS = Object.freeze({
  'safety.view':'View permitted Safety review rounds',
  'safety.decide':'Record a Safety decision',
  'safety.submit':'Submit current arrangements for Safety review',
  'safety.rework':'Review and direct Safety rework',
  'technical.view':'View current technical requests',
  'technical.submit':'Submit technical requirements',
  'technical.review':'Review technical requirements',
  // Technical Support: deliveries that failed after their retries (CS-50 AC5).
  'notifications.failures.view': 'See notification deliveries that failed',

  // Event requests and events
  'event_requests.create': 'Submit event requests',
  'event_requests.review': 'Approve or reject event requests',
  'events.view': 'See events',
  'events.technical.metadata.view': 'View event metadata for technical requests',
  'events.confirm': 'Confirm events once arrangements are ready',
  'assignments.view': 'Coordinator Lead: open the Unassigned Queue (assigning comes with CS-81/CS-30)',

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
const { ROLES } = require('../../../utils/role-policy');

function isKnownPermission(permission) {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, permission);
}

module.exports = { PERMISSIONS, ROLES, isKnownPermission };
