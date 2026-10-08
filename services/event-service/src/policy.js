const { countsAsActive } = require('./domain/assignment');

function isOrganiser(actor) { return actor?.role === 'EVENT_ORGANISER' || actor?.permissions?.includes('event_requests.create'); }
function isCoordinator(actor) { return actor?.role === 'EVENT_COORDINATOR' || actor?.permissions?.includes('event_requests.review'); }

function canRead(actor, record) {
  if (isOrganiser(actor)) return actor.id === record.organiserId || Boolean(actor.organisationId && actor.organisationId === record.organisationId);
  if (isCoordinator(actor)) return record.currentCoordinatorId ? actor.id === record.currentCoordinatorId : record.status === 'SUBMITTED';
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
  if (isCoordinator(actor)) {
    if (record.status === 'SUBMITTED' && !record.currentCoordinatorId) actions.push('claim');
    if (record.status === 'SUBMITTED' && (!record.currentCoordinatorId || actor.id === record.currentCoordinatorId)) actions.push('approve', 'reject', 'amendments');
    if (record.currentCoordinatorId === actor.id && ['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED'].includes(record.status)) actions.push('reassign');
  }
  return actions;
}

module.exports = { isOrganiser, isCoordinator, canRead, canEdit, canDecide, allowedActions, countsAsActive };
