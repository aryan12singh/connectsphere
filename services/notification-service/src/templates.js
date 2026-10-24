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
// CS-51 planning and Staff actions share the durable producer/relay/consumer
// pipeline. Contract fixtures check individual templates; live acceptance
// separately verifies current source context and delivery. See api-contract.md.
const PLANNING_TYPES = [
  'BookingRequested', 'BookingDecided', 'BookingCancelled','BookingChanged','BookingRestored','ReplacementApproved', 'VenueUnavailable', 'BufferConflictFlagged',
  'HoldExpiring', 'HoldExpired', 'HoldExtensionRequested', 'HoldExtended', 'SafetySubmitted', 'SafetyApproved', 'SafetyEvidenceInvalidated', 'SafetyChangesRequested',
];
const ATTENDEE_TYPES = [
  'RegistrationCreated', 'RegistrationWaitlisted', 'WaitlistOfferMade',
  'WaitlistOfferExpired', 'WaitlistOfferAccepted', 'RegistrationWithdrawn',
];
const HANDLED = [...LIFECYCLE_TYPES, ...PLANNING_TYPES, ...ATTENDEE_TYPES, 'EventCancelled'];

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
    eventVersion: p.eventVersion || null,
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
  const { names, usersWithRole,attendeeIds } = typeof lookups === 'function' ? { names: lookups } : lookups;
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
    case 'RegistrationCreated':
    case 'RegistrationWaitlisted':
    case 'WaitlistOfferMade':
    case 'WaitlistOfferExpired':
    case 'WaitlistOfferAccepted':
    case 'RegistrationWithdrawn': {
      const userId = p.userId || p.attendeeId;
      const types = {
        RegistrationCreated: ['REGISTRATION_CONFIRMED', 'Your registration for'],
        RegistrationWaitlisted: ['REGISTRATION_WAITLISTED', 'You joined the waitlist for'],
        WaitlistOfferMade: ['WAITLIST_OFFER_MADE', 'A place is available for'],
        WaitlistOfferExpired: ['WAITLIST_OFFER_EXPIRED', 'The offer for'],
        WaitlistOfferAccepted: ['WAITLIST_OFFER_ACCEPTED', 'Your place is confirmed for'],
        RegistrationWithdrawn: ['REGISTRATION_WITHDRAWN', 'Your registration for'],
      };
      const [type, lead] = types[message.type];
      const suffix = message.type === 'WaitlistOfferExpired' ? ' has expired.'
        : message.type === 'RegistrationWithdrawn' ? ' was withdrawn.'
          : message.type === 'RegistrationWaitlisted' ? ' is waitlisted.'
            : message.type === 'RegistrationCreated' ? ' is confirmed.'
              : message.type === 'WaitlistOfferMade' ? ' Review the offer before its deadline.' : '.';
      return userId ? [notice(userId, type, `${lead} ${name}${suffix}`, p.eventId ? `/attendances/events/${p.eventId}` : null)] : [];
    }
    case 'EventCancelled': {
      const attendees = attendeeIds ? await attendeeIds(p.eventId) : [];
      return attendees.map(id => notice(id, 'EVENT_CANCELLED', `${name} has been cancelled.`, `/attendances/events/${p.eventId}`));
    }
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
    case 'EventConfirmed': {
      const venueChanged = Boolean(p.attendeeVenueChanged);
      const changed = Boolean(p.attendeeMaterialChange || venueChanged);
      const zone = p.timeZone || 'Asia/Singapore';
      const formatDateTime = value => new Intl.DateTimeFormat('en-SG', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
      const period = p.startAt ? `${formatDateTime(p.startAt)}${p.endAt ? `–${formatDateTime(p.endAt)}` : ''} (${zone})` : null;
      const places = (p.venueNames || []).join(', ');
      const changedText = `The confirmed details for ${name} changed${period ? ` to ${period}` : ''}${places ? ` at ${places}` : ''}. Open the Event for current details.`;
      const changeType = venueChanged ? 'VENUE_CHANGED' : 'EVENT_CHANGED';
      const notices=[p.attendeeVenueChanged
        ? notice(p.organiserId,'VENUE_CHANGED',changedText,`/attendances/events/${p.eventId}`)
        : notice(p.organiserId,'EVENT_CONFIRMED',`${name} is confirmed.`,p.eventId?`/events/${p.eventId}`:requestLink)];
      if(changed && attendeeIds) {
        const safeDetails = { eventVersion: p.eventVersion || null, startAt: p.startAt || null, endAt: p.endAt || null, timeZone: zone, venueNames: p.venueNames || [] };
        for (const id of await attendeeIds(p.eventId)) notices.push(notice(id, changeType, changedText, `/attendances/events/${p.eventId}`, safeDetails));
      }
      return notices;
    }
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

  const affectedStaff=async(type,text)=>{
    const active=await usersWithRole('VENUE_STAFF');
    return (p.staffRecipientIds||[]).filter(id=>active.includes(id)).map(id=>notice(id,type,text,VENUE_WORKSPACE,extra));
  };
  switch (message.type) {
    case 'BookingCancelled':return affectedStaff('BOOKING_CANCELLED',p.cancellationActionId?`The Event ${name} was cancelled by its Coordinator. This venue booking${venue} is released, including its setup and turnaround interval.`:`The venue booking${venue} for ${name} was cancelled by its Coordinator. Its occupied interval is released. Other rooms remain unchanged.`);
    case 'BookingChanged':return affectedStaff('BOOKING_CHANGED',`The venue booking${venue} for ${name} changed and needs fresh Venue Staff review. Other rooms remain unchanged.`);
    case 'BookingRestored':return [notice(p.coordinatorId,'BOOKING_RESTORED',`Venue Staff confirmed restoration of the original booking${venue} for ${name}. Review current Safety readiness before proceeding.`,VENUE_WORKSPACE,extra),notice(p.organiserId,'BOOKING_RESTORED',`The original venue booking${venue} for ${name} has been restored by Venue Staff. Your Coordinator will review the next planning step.`,eventLink,extra)];
    case 'ReplacementApproved':return [notice(p.coordinatorId,'VENUE_REPLACEMENT_APPROVED',`The replacement${venue} for ${name} was approved. The original booking is retained as Replaced. Complete current Safety review before reconfirmation.`,VENUE_WORKSPACE,extra),notice(p.organiserId,'VENUE_REPLACEMENT_APPROVED',`A replacement venue${venue} for ${name} was approved. Your Coordinator is completing Safety review and reconfirmation.`,eventLink,extra)];
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
      const labels={MAINTENANCE:'Maintenance',EQUIPMENT_FAILURE:'Equipment failure',RENOVATION:'Renovation',SAFETY_CONCERN:'Safety concern',OTHER:'Other'};
      const zone=p.timeZone||'Asia/Singapore';
      const format=new Intl.DateTimeFormat('en-SG',{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
      const period=(p.unavailability||[]).map(block=>`${format.format(new Date(block.startAt))}–${format.format(new Date(block.endAt))} (${zone}): ${labels[block.category]||'Operational unavailability'}`).join('; ');
      const reason = period ? ` (${period})` : '';
      const unavailableExtra={...extra,timeZone:zone,unavailability:(p.unavailability||[]).map(({startAt,endAt,category})=>({startAt,endAt,category}))};
      return [
        notice(p.coordinatorId, 'VENUE_UNAVAILABLE', `The venue${venue} is no longer available for ${name}${reason}. The booking is kept and marked for replacement. Please arrange an alternative.`, eventLink || VENUE_WORKSPACE, unavailableExtra),
        // Session 3: tell the Organiser the affected venue and next step, no internal reason.
        notice(p.organiserId, 'VENUE_CHANGE_NEEDED', `A venue${venue} for ${name} needs an alternative${period?` (${period})`:''}. Your Coordinator is arranging the next step.`, eventLink, unavailableExtra),
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

    case 'HoldExtensionRequested':
      return toStaff('VENUE_STAFF','HOLD_EXTENSION_REQUESTED',`An extension was requested for the tentative hold${venue} for ${name}. Please review the active hold.`,VENUE_WORKSPACE);
    case 'HoldExtended':
      return [notice(p.coordinatorId,'HOLD_EXTENDED',`Venue Staff extended the tentative hold${venue} for ${name} to ${p.expiresAt}.`,VENUE_WORKSPACE,{...extra,expiresAt:p.expiresAt})];
    case 'SafetySubmitted':
      return toStaff('SAFETY_OFFICER','SAFETY_REVIEW_PENDING',`${name} has current arrangements ready for your Safety review.`,p.roundId?`/safety-checks/${p.roundId}`:'/safety-checks');
    case 'SafetyApproved':
      return [notice(p.coordinatorId,'SAFETY_APPROVED',`Safety review for ${name} is approved. Confirm the Event when the current arrangements are ready.`,eventLink),notice(p.organiserId,'SAFETY_APPROVED',`Safety review for ${name} is approved. Your Coordinator will confirm the next stage.`,eventLink)];
    case 'SafetyEvidenceInvalidated':
      return [notice(p.coordinatorId,'SAFETY_REVIEW_REQUIRED',`Arrangements for ${name} changed. Review the current arrangements before a new Safety submission.`,eventLink)];
    case 'SafetyChangesRequested': {
      // TC-CS51-06: only the areas named in the decision are alerted.
      const areas = Array.isArray(p.areas) ? p.areas : [];
      const comment = p.comment ? ` "${p.comment}"` : '';
      const notices = [
        notice(p.coordinatorId, 'SAFETY_CHANGES_REQUESTED', `Safety check for ${name} asks for changes to ${areas.join(', ').toLowerCase() || 'the arrangements'}.${comment}`, eventLink),
        // Session 3: the Organiser may see the actionable comment, never private notes.
        notice(p.organiserId, 'SAFETY_CHANGES_REQUESTED', `The safety check for ${name} asks for changes. Your Coordinator will follow up.${comment}`, eventLink),
      ];
      if ((areas.includes('EQUIPMENT')||areas.includes('TECHNICAL'))) notices.push(...await toStaff('TECHNICAL_SUPPORT_STAFF', 'SAFETY_CHANGES_REQUESTED', `Safety check for ${name} asks for equipment changes.${comment}`, null));
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

module.exports = { HANDLED, LIFECYCLE_TYPES, PLANNING_TYPES, ATTENDEE_TYPES, noticesFor, standardData, badgeLabel };
