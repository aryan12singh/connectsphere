// Canonical default role permissions mirrored from auth-service's
// auth_db.role_permissions seed. This is used only by isolated test/mock
// adapters; production authorization comes from auth-service at runtime.
module.exports = Object.freeze({
  SAFETY_OFFICER:Object.freeze(['safety.view','safety.decide']),
  EVENT_COORDINATOR_LEAD:Object.freeze(['assignments.view','events.view']),
  EVENT_COORDINATOR: Object.freeze([
    'event_requests.review', 'events.confirm', 'events.view', 'messages.send',
    'venue_bookings.create', 'venues.view','safety.submit','safety.rework','technical.submit','technical.view',
  ]),
  VENUE_STAFF: Object.freeze([
    'events.view', 'messages.send', 'venue_bookings.decide', 'venues.manage', 'venues.view',
  ]),
  TECHNICAL_SUPPORT_STAFF: Object.freeze([
    'technical.review','technical.view','events.technical.metadata.view','audit.view', 'permissions.manage', 'settings.manage', 'users.manage', 'users.view', 'venues.view',
  ]),
  EVENT_ORGANISER: Object.freeze(['event_requests.create', 'events.view', 'messages.send']),
  ATTENDEE: Object.freeze(['attendance.register', 'events.view']),
});
