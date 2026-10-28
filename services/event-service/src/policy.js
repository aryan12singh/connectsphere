const { countsAsActive } = require('./domain/assignment');

function isOrganiser(actor) { return actor?.role === 'EVENT_ORGANISER' || actor?.permissions?.includes('event_requests.create'); }
function isCoordinator(actor) { return actor?.role === 'EVENT_COORDINATOR' || actor?.permissions?.includes('event_requests.review'); }
// Week 7: the Coordinator Lead assigns and reassigns. A Lead is never a Coordinator.
function isLead(actor) { return Boolean(actor?.role === 'EVENT_COORDINATOR_LEAD' || (Array.isArray(actor?.roles) && actor.roles.includes('EVENT_COORDINATOR_LEAD')) || actor?.permissions?.includes('assignments.view')); }

function canRead(actor, record) {
  // Event-request records, including drafts and review history, stay private
  // to the owner and assigned Coordinator. Organisation visibility applies to
  // the published Event projection, not the underlying request.
  if (isOrganiser(actor)) return actor.id === record.organiserId;
  // A Coordinator sees only requests assigned to them. The Lead sees a queued
  // (unassigned, submitted) request read-only until it is assigned.
  if (isCoordinator(actor)) return actor.id === record.currentCoordinatorId;
  if (isLead(actor)) return record.status === 'SUBMITTED' && !record.currentCoordinatorId;
  return false;
}

function canEdit(actor, record) {
  return isOrganiser(actor) && actor.id === record.organiserId && ['DRAFT', 'RETURNED_FOR_AMENDMENT'].includes(record.status);
}

function canDecide(actor, record) {
  return isCoordinator(actor) && actor.id === record.currentCoordinatorId;
}

function allowedActions(actor, record) {
  const actions = [];
  if (isOrganiser(actor) && actor.id === record.organiserId) {
    if (record.status === 'DRAFT') actions.push('edit', 'submit');
    if (record.status === 'RETURNED_FOR_AMENDMENT') actions.push('edit', 'resubmit');
  }
  if (isLead(actor) && !isCoordinator(actor) && record.status === 'SUBMITTED' && !record.currentCoordinatorId) actions.push('assign');
  if (isCoordinator(actor)) {
    // Only the assigned Coordinator decides; nobody can decide an unassigned request.
    if (record.status === 'SUBMITTED' && actor.id === record.currentCoordinatorId) actions.push('approve', 'reject', 'amendments');
    // CS-12: an approved request whose Event is still in Planning can be rejected by its current Coordinator (closes request and Event together).
    if (record.currentCoordinatorId === actor.id && record.status === 'APPROVED' && record.event?.status === 'ARRANGEMENT_PENDING') actions.push('reject');
  }
  return actions;
}

module.exports = { isOrganiser, isCoordinator, isLead, canRead, canEdit, canDecide, allowedActions, countsAsActive };
