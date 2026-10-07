const { hasPermission } = require('../../utils/role-policy');
const STAFF_ROLES = new Set(['VENUE_STAFF']);
const COORDINATOR_CREATE_STATUSES = new Set(['TENTATIVELY_HELD', 'CANCELLED']);

function isStaff(actor) {
  return hasPermission(actor, 'venue_bookings.decide');
}

function statusForCreate(actor, requestedStatus) {
  return requestedStatus || 'TENTATIVELY_HELD';
}

function canCreateStatus(actor, status) {
  return hasPermission(actor, 'venue_bookings.decide') || COORDINATOR_CREATE_STATUSES.has(status);
}

function coordinatorCanCancel(booking, actor, nextStatus) {
  return booking?.requestedById === actor?.id
    && booking?.status === 'TENTATIVELY_HELD'
    && nextStatus === 'CANCELLED';
}

function coordinatorCanEdit(booking, actor, nextStatus) {
  return booking?.requestedById === actor?.id
    && ['TENTATIVELY_HELD', 'CANCELLED'].includes(booking?.status)
    && ['TENTATIVELY_HELD', 'CANCELLED'].includes(nextStatus);
}

function canReplace(booking, actor, nextStatus) {
  if (hasPermission(actor, 'venue_bookings.decide')) return { allowed: true };
  if (!coordinatorCanEdit(booking, actor, nextStatus)) {
    return { allowed: false, message: 'Coordinators may only edit their own tentative or cancelled bookings to tentative or cancelled' };
  }
  return { allowed: true };
}

module.exports = {
  STAFF_ROLES,
  isStaff,
  statusForCreate,
  canCreateStatus,
  coordinatorCanCancel,
  coordinatorCanEdit,
  canReplace,
};
