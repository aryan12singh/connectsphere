// Roles constrain actions even when an editable capability is granted.
// Identity and capabilities come from auth-service; callers cannot choose them.
const ROLES = Object.freeze(['EVENT_ORGANISER', 'EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'ATTENDEE']);
const PUBLIC_ROLES = Object.freeze(['EVENT_ORGANISER', 'ATTENDEE']);
const INTERNAL_ROLES = Object.freeze(['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF']);
const ACTION_ROLES = Object.freeze({
  'users.view': ['TECHNICAL_SUPPORT_STAFF'],
  'users.manage': ['TECHNICAL_SUPPORT_STAFF'],
  'permissions.manage': ['TECHNICAL_SUPPORT_STAFF'],
  'settings.manage': ['TECHNICAL_SUPPORT_STAFF'],
  'audit.view': ['TECHNICAL_SUPPORT_STAFF'],
  'event_requests.create': ['EVENT_ORGANISER'],
  'event_requests.review': ['EVENT_COORDINATOR'],
  'events.view': ROLES,
  'events.confirm': ['EVENT_COORDINATOR'],
  'venues.view': INTERNAL_ROLES,
  'venues.manage': ['VENUE_STAFF'],
  'venue_bookings.create': ['EVENT_COORDINATOR'],
  'venue_bookings.decide': ['VENUE_STAFF'],
  'attendance.register': ['ATTENDEE'],
  'messages.send': ROLES,
});
function rolesForUser(user) {
  const roles = user?.roles === undefined ? [user?.role] : user.roles;
  if (!Array.isArray(roles) || roles.length === 0 || roles.some(role => !ROLES.includes(role))) return [];
  return [...new Set(roles)];
}
function hasPermission(actor, permission) {
  return Array.isArray(actor?.permissions)
    && actor.permissions.includes(permission)
    && rolesForUser(actor).some(role => ACTION_ROLES[permission]?.includes(role));
}
module.exports = { ROLES, PUBLIC_ROLES, INTERNAL_ROLES, ACTION_ROLES, rolesForUser, hasPermission };
