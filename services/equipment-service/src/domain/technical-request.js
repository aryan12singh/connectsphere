const TECHNICAL_SUPPORT = 'TECHNICAL_SUPPORT_STAFF';
const COORDINATOR = 'EVENT_COORDINATOR';
const SAFETY = 'SAFETY_OFFICER';

function validateRequirements(input, equipmentTypes, previous) {
  const errors = {};
  const knownTypes = new Set(equipmentTypes);
  if (!input || typeof input.eventId !== 'string' || !input.eventId.trim()) errors.eventId = ['Event is required.'];
  if (!input || typeof input.coordinatorId !== 'string' || !input.coordinatorId.trim()) errors.coordinatorId = ['Current Coordinator is required.'];
  if (!input || !Array.isArray(input.equipment)) errors.equipment = ['Equipment must be a list.'];
  const equipment = Array.isArray(input?.equipment) ? input.equipment : [];
  equipment.forEach((line, index) => {
    if (!knownTypes.has(line?.equipmentType)) errors[`equipment.${index}.equipmentType`] = ['Choose a known equipment type.'];
    if (!Number.isInteger(line?.quantity) || line.quantity < 1) errors[`equipment.${index}.quantity`] = ['Quantity must be a whole number of at least 1.'];
  });
  if (new Set(equipment.map(line=>line.equipmentType)).size!==equipment.length) errors.equipment=['Use one quantity line per equipment type.'];
  if (input?.supportRequired && (typeof input.supportDetails !== 'string' || !input.supportDetails.trim())) errors.supportDetails = ['Describe the requested support.'];
  if (typeof input?.placementDetails !== 'string' || !input.placementDetails.trim()) errors.placementDetails = ['Describe the required placement or preparation.'];
  if (equipment.length === 0 && !input?.supportRequired && !input?.notRequired) errors.requirements = ['Specify equipment or support, or explicitly mark both as not required.'];
  if ((equipment.length > 0 || input?.supportRequired) && input?.notRequired) errors.notRequired = ['A request with equipment cannot be marked not required.'];
  if (Object.keys(errors).length) return { valid: false, errors };

  const normalized = {
    eventId: input.eventId.trim(),
    coordinatorId: input.coordinatorId.trim(),
    equipment: equipment.map(({ equipmentType, quantity }) => ({ equipmentType, quantity })),
    supportRequired: Boolean(input.supportRequired),
    supportDetails: input.supportRequired ? input.supportDetails.trim() : '',
    placementDetails: input.placementDetails.trim(),
    notRequired: Boolean(input.notRequired),
  };
  const changed = !previous || JSON.stringify(previous.requirements) !== JSON.stringify(normalized);
  return {
    valid: true,
    value: {
      eventId: normalized.eventId,
      coordinatorId: normalized.coordinatorId,
      requirements: normalized,
      version: previous ? previous.version + (changed ? 1 : 0) : 1,
      status: previous && !changed ? previous.status : 'SUBMITTED',
      readiness: 'PENDING',
      notRequired: normalized.notRequired,
    },
  };
}

function decideRequirements(request, actor, decision, reason = '', expectedVersion = request?.version) {
  if (!((actor?.roles||[actor?.role]).includes(TECHNICAL_SUPPORT))) throw Object.assign(new Error('Technical Support permission is required.'), { status: 403 });
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw Object.assign(new Error('Decision must be APPROVED or REJECTED.'), { status: 422 });
  if (decision === 'REJECTED' && !reason.trim()) throw Object.assign(new Error('A reason is required to reject.'), { status: 422 });
  if (expectedVersion !== request?.version) throw Object.assign(new Error('This request changed. Reload before deciding.'), { status: 409 });
  if (request?.status !== 'SUBMITTED') throw Object.assign(new Error('Only a submitted request can be decided.'), { status: 409 });
  return { ...request, status: decision, readiness: decision, decisionReason: decision === 'REJECTED' ? reason.trim() : null };
}

function canReadRequirements(actor, request) {
  if (!actor || !request) return false;
  if (actor.role === COORDINATOR && actor.id === request.coordinatorId) return true;
  if (actor.role === TECHNICAL_SUPPORT) return true;
  return actor.role === SAFETY && Array.isArray(actor.permittedEventIds) && actor.permittedEventIds.includes(request.eventId);
}

function canEditRequirements(actor, request) {
  return actor?.role === COORDINATOR && actor.id === request?.coordinatorId;
}

function poolVenueAllocations(allocations) {
  if (!Array.isArray(allocations)) throw new TypeError('Venue allocations must be a list.');
  const byType = new Map();
  for (const allocation of allocations) {
    if (typeof allocation?.venueId !== 'string' || !allocation.venueId.trim()) throw new TypeError('Every allocation needs a venue.');
    if (typeof allocation?.equipmentType !== 'string' || !allocation.equipmentType.trim()) throw new TypeError('Every allocation needs an equipment type.');
    if (!Number.isInteger(allocation.quantity) || allocation.quantity < 1) throw new TypeError('Every allocation quantity must be a positive whole number.');
    byType.set(allocation.equipmentType, (byType.get(allocation.equipmentType) || 0) + allocation.quantity);
  }
  return [...byType].map(([equipmentType, quantity]) => ({ equipmentType, quantity }));
}

module.exports = { validateRequirements, decideRequirements, canReadRequirements, canEditRequirements, poolVenueAllocations };
