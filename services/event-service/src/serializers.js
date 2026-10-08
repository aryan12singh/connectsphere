function iso(value) { return value instanceof Date ? value.toISOString() : value || null; }

function localParts(value, timeZone) {
  if (!value) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const result = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${result.year}-${result.month}-${result.day}`, time: `${result.hour}:${result.minute}` };
}

function userSummary(id, actor) {
  if (!id) return null;
  return { id, name: actor?.name || id, email: actor?.email || '' };
}

function localAllowedActions(record, actor) {
  const actions = [];
  if (actor?.role === 'EVENT_ORGANISER' && actor.id === record.organiserId) {
    if (record.status === 'DRAFT') actions.push('edit', 'submit');
    if (record.status === 'RETURNED_FOR_AMENDMENT') actions.push('edit', 'resubmit');
  }
  if (actor?.role === 'EVENT_COORDINATOR') {
    if (record.status === 'SUBMITTED') {
      if (!record.currentCoordinatorId) actions.push('claim');
      if (!record.currentCoordinatorId || record.currentCoordinatorId === actor.id) actions.push('approve', 'reject', 'amendments');
    }
  }
  return actions;
}

function toRequest(record, actor, assignment = null) {
  const start = localParts(record.startAt, record.timeZone);
  const end = localParts(record.endAt, record.timeZone);
  return {
    id: record.id,
    organiserId: record.organiserId,
    organisationId: record.organisationId || null,
    status: record.status,
    version: record.version,
    currentCoordinatorId: record.currentCoordinatorId || null,
    eventName: record.eventName || '',
    purpose: record.purpose || '',
    description: record.description || '',
    startAt: iso(record.startAt),
    endAt: iso(record.endAt),
    proposedDate: start.date,
    startTime: start.time,
    endTime: end.time,
    timeZone: record.timeZone || '',
    expectedAttendance: record.expectedAttendance,
    minimumCapacity: record.minimumCapacity,
    preferredLayout: record.preferredLayout,
    venueType: record.venueType,
    venueRequirements: record.venueRequirements,
    accessibilityNeeds: record.accessibilityNeeds || [],
    accessibilityDetails: record.accessibilityDetails,
    equipmentNeeds: record.equipmentNeeds || [],
    technicalDetails: record.technicalDetails,
    coordinator: assignment ? { coordinator: userSummary(assignment.coordinatorId), assignedAt: iso(assignment.assignedAt), assignedBy: userSummary(assignment.assignedById), reason: assignment.reason } : null,
    awaitingAssignment: record.status === 'SUBMITTED' && !record.currentCoordinatorId,
    submittedAt: iso(record.submittedAt),
    decidedAt: iso(record.decidedAt),
    decidedBy: userSummary(record.decidedById),
    decisionReason: record.decisionReason || null,
    event: record.event ? { id: record.event.id, status: record.event.status } : null,
    allowedActions: localAllowedActions(record, actor),
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

function toEvent(event) {
  return { id: event.id, eventRequestId: event.eventRequestId, organiserId: event.organiserId, organisationId: event.organisationId || null, title: event.title, description: event.description, startAt: iso(event.startAt), endAt: iso(event.endAt), timeZone: event.timeZone, status: event.status, version: event.version, confirmedAt: iso(event.confirmedAt), cancelledAt: iso(event.cancelledAt), completedAt: iso(event.completedAt) };
}

module.exports = { toRequest, toEvent };
