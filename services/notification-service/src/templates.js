// CS-50: which domain message notifies whom, and what the notice says.
//
// Input: a domain message from event-service's outbox
//   { id, type, aggregateId, payload: { eventRequestId, organiserId,
//     coordinatorId, fromCoordinatorId, eventId, eventName, oldStatus,
//     newStatus, occurredAt } }
// Output: a list of notices { recipientId, type, text, link, eventRequestId,
//   eventId, data }.
//
// Privacy rules:
// - Only people tied to the request get a notice (owner Organiser, current or
//   previous Coordinator). Nobody else (CS-50 AC6).
// - Text uses the event name, statuses and a Coordinator's name only. No
//   internal notes, no other users' data.
// - A Coordinator who was reassigned away gets no link: they no longer have
//   access, so a link would only lead to "access denied".

// Message types handled. Others are recorded and ignored.
// CS-50: event lifecycle and Coordinator assignment.
const LIFECYCLE_TYPES = [
  'RequestSubmitted', 'RequestResubmitted', 'CoordinatorAssigned', 'CoordinatorReassigned',
  'RequestApproved', 'RequestRejected', 'RequestReturned', 'EventConfirmed',
];
// CS-51: planning decisions and staff actions. Their producers belong to
// other stories (venue booking CS-37/38, buffers CS-86, unavailability
// CS-90/91, safety CS-93/94). Until those publish real messages, these
// templates are proven with sample messages (allowed by the CS-51 card).
// The expected payload of each type is listed in docs/api-contract.md.
const PLANNING_TYPES = [
  'BookingRequested', 'BookingDecided', 'VenueUnavailable', 'BufferConflictFlagged',
  'HoldExpiring', 'HoldExpired', 'SafetyChangesRequested',
];
const HANDLED = [...LIFECYCLE_TYPES, ...PLANNING_TYPES];

// Pages a notice may link to. Venue booking notices open the venue
// workspace; a dedicated booking review page does not exist yet (CS-38).
const VENUE_WORKSPACE = '/venue';

/** The standard fields every notice carries (same shape for all types). */
function standardData(message, extra = {}) {
  const p = message.payload || {};
  return {
    eventName: p.eventName || 'your event',
    requestId: p.eventRequestId || message.aggregateId || null,
    eventId: p.eventId || null,
    oldStatus: p.oldStatus || null,
    newStatus: p.newStatus || null,
    timestamp: p.occurredAt || null,
    ...extra,
  };
}

/**
 * Builds the notices for one message.
 * @param message  domain message
 * @param lookups  { names: async (userId) => display name,
 *                   usersWithRole: async (role) => [userId] }
 *                 (a plain function is accepted as `names`)
 */
async function noticesFor(message, lookups) {
  const { names, usersWithRole } = typeof lookups === 'function' ? { names: lookups } : lookups;
  const p = message.payload || {};
  const name = `"${p.eventName || 'your event'}"`;
  const requestId = p.eventRequestId || message.aggregateId;
  const requestLink = requestId ? `/requests/${requestId}` : null;
  const notice = (recipientId, type, text, link = requestLink, extra = {}) => ({
    recipientId, type, text, link,
    eventRequestId: requestId || null,
    eventId: p.eventId || null,
    data: standardData(message, extra),
  });

  switch (message.type) {
    case 'RequestSubmitted':
      return [notice(p.organiserId, 'REQUEST_SUBMITTED', `Your event request ${name} was submitted. A Coordinator will be assigned to review it.`)];
    case 'RequestResubmitted':
      return [notice(p.coordinatorId, 'REQUEST_RESUBMITTED', `${name} was amended and resubmitted for your review.`)];
    case 'CoordinatorAssigned': {
      const coordinator = await names(p.coordinatorId);
      return [
        notice(p.coordinatorId, 'ASSIGNED_TO_YOU', `You have been assigned the event request ${name}. Please review it.`),
        notice(p.organiserId, 'COORDINATOR_ASSIGNED', `${coordinator} is now the Coordinator for ${name}.`, requestLink, { coordinator }),
      ];
    }
    case 'CoordinatorReassigned': {
      const coordinator = await names(p.coordinatorId);
      return [
        notice(p.fromCoordinatorId, 'REASSIGNED_AWAY', `${name} has been reassigned to another Coordinator. You no longer have access to it.`, null),
        notice(p.coordinatorId, 'ASSIGNED_TO_YOU', `You have been assigned the event request ${name}. Please review it.`),
        notice(p.organiserId, 'COORDINATOR_CHANGED', `Your Coordinator for ${name} has changed to ${coordinator}.`, requestLink, { coordinator }),
      ];
    }
    case 'RequestApproved':
      return [notice(p.organiserId, 'EVENT_APPROVED', `Your event request ${name} was approved. Planning has started.`, p.eventId ? `/events/${p.eventId}` : requestLink)];
    case 'RequestRejected':
      return [notice(p.organiserId, 'REQUEST_REJECTED', `Your event request ${name} was not approved. Open it to see the outcome.`)];
    case 'RequestReturned': {
      // CS-51 AC1: the Organiser sees the Coordinator's comments right away.
      const comment = p.comment ? ` The Coordinator's comments: "${p.comment}"` : " Open it to see the Coordinator's comments.";
      return [notice(p.organiserId, 'REQUEST_RETURNED', `${name} was returned for changes.${comment}`, requestLink, { comment: p.comment || null })];
    }
    case 'EventConfirmed': // produced later by CS-31; the template is ready
      return [notice(p.organiserId, 'EVENT_CONFIRMED', `${name} is confirmed.`, p.eventId ? `/events/${p.eventId}` : requestLink)];
    default:
      return planningNotices(message, { notice, name, usersWithRole });
  }
}

// ── CS-51: planning decisions and staff actions ───────────────────────────
// Privacy: staff reasons (maintenance, rejection reasons, buffer details) go
// to the Coordinator and staff only. The Organiser is told what changed and
// what happens next, never the internal reason (TC-CS51-04).
async function planningNotices(message, { notice, name, usersWithRole }) {
  const p = message.payload || {};
  const venue = p.venueName ? ` at ${p.venueName}` : '';
  const eventLink = p.eventId ? `/events/${p.eventId}` : null;
  const extra = { bookingId: p.bookingId || null, venueId: p.venueId || null };
  const toStaff = async (role, type, text, link) => (await usersWithRole(role))
    .map((userId) => notice(userId, type, text, link, extra));

  switch (message.type) {
    case 'BookingRequested':
      // TC-CS51-03: every active Venue Staff member learns about waiting work.
      return toStaff('VENUE_STAFF', 'NEW_BOOKING_REQUEST', `New booking request for ${name}${venue}. Please review it.`, VENUE_WORKSPACE);

    case 'BookingDecided': {
      if (p.decision === 'REJECTED') {
        const reason = p.reason ? ` Reason: ${p.reason}.` : '';
        return [
          notice(p.coordinatorId, 'VENUE_REJECTED', `The venue booking${venue} for ${name} was rejected.${reason} Please choose another venue or time.`, VENUE_WORKSPACE, extra),
          notice(p.organiserId, 'VENUE_DECISION', `A venue for ${name} was not approved. Your Coordinator is arranging the next step.`, eventLink, extra),
        ];
      }
      if (p.decision === 'APPROVED') {
        // One venue approved is not the whole event being ready (CS-51 AC).
        const pending = Number.isInteger(p.remainingRequired) && p.remainingRequired > 0
          ? ` ${p.remainingRequired} other required venue(s) are still pending.` : '';
        return [
          notice(p.coordinatorId, 'VENUE_APPROVED', `The venue booking${venue} for ${name} was approved.${pending}`, VENUE_WORKSPACE, extra),
          notice(p.organiserId, 'VENUE_DECISION', `A venue for ${name} was approved.${pending}`, eventLink, extra),
        ];
      }
      return [];
    }

    case 'VenueUnavailable': {
      // TC-CS51-02: nothing is cancelled; the Coordinator must arrange an alternative.
      const reason = p.reason ? ` (${p.reason})` : '';
      return [
        notice(p.coordinatorId, 'VENUE_UNAVAILABLE', `The venue${venue} is no longer available for ${name}${reason}. The booking is kept and marked for replacement. Please arrange an alternative.`, VENUE_WORKSPACE, extra),
        // Session 3: tell the Organiser the affected venue and next step, no internal reason.
        notice(p.organiserId, 'VENUE_CHANGE_NEEDED', `A venue${venue} for ${name} needs to be replaced. Your Coordinator is arranging an alternative.`, eventLink, extra),
      ];
    }

    case 'BufferConflictFlagged':
      // CS-86 flag: Coordinator only. Nothing was changed or cancelled.
      return [notice(p.coordinatorId, 'BUFFER_CONFLICT', `Your venue booking${venue} for ${name} now overlaps another booking once setup and turnaround time are included. It has not been changed. Please contact Venue Staff.`, VENUE_WORKSPACE, extra)];

    case 'HoldExpiring':
      // The hold scheduler (CS-37/CS-90) decides WHEN; one warning per hold deadline.
      return [notice(p.coordinatorId, 'HOLD_EXPIRING', `Your tentative hold${venue} for ${name} expires at ${p.expiresAt || 'its deadline'}. Ask for an extension or confirm the booking before then.`, VENUE_WORKSPACE, { ...extra, expiresAt: p.expiresAt || null })];

    case 'HoldExpired':
      return [notice(p.coordinatorId, 'HOLD_EXPIRED', `Your tentative hold${venue} for ${name} has expired and the slot was released. Check availability and request the venue again.`, VENUE_WORKSPACE, extra)];

    case 'SafetyChangesRequested': {
      // TC-CS51-06: only the areas named in the decision are alerted.
      const areas = Array.isArray(p.areas) ? p.areas : [];
      const comment = p.comment ? ` "${p.comment}"` : '';
      const notices = [
        notice(p.coordinatorId, 'SAFETY_CHANGES_REQUESTED', `Safety check for ${name} asks for changes to ${areas.join(', ').toLowerCase() || 'the arrangements'}.${comment}`, eventLink),
        // Session 3: the Organiser may see the actionable comment, never private notes.
        notice(p.organiserId, 'SAFETY_CHANGES_REQUESTED', `The safety check for ${name} asks for changes. Your Coordinator will follow up.${comment}`, eventLink),
      ];
      if (areas.includes('EQUIPMENT')) notices.push(...await toStaff('TECHNICAL_SUPPORT_STAFF', 'SAFETY_CHANGES_REQUESTED', `Safety check for ${name} asks for equipment changes.${comment}`, null));
      if (areas.includes('VENUE')) notices.push(...await toStaff('VENUE_STAFF', 'SAFETY_CHANGES_REQUESTED', `Safety check for ${name} asks for venue changes.${comment}`, VENUE_WORKSPACE));
      return notices;
    }

    default:
      return [];
  }
}

/** Unread badge text: exact up to 99, then "99+" (placeholder cap). */
function badgeLabel(unread) {
  if (!unread) return '';
  return unread > 99 ? '99+' : String(unread);
}

module.exports = { HANDLED, LIFECYCLE_TYPES, PLANNING_TYPES, noticesFor, standardData, badgeLabel };
