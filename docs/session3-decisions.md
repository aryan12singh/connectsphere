# Session 3 customer decision record

Received and reconciled 14 October 2026. Source: `Session 3 - Clarification Answers_G8.xlsx`, sheet `G8`, question column B and answer column C. SHA256: `c1ca0c2e631b67631d9ae6a3b8095346fa12c47b879a7d22bcea28c525cca667`. Source wording below is preserved, including incomplete sentences and cross-references. The numbered references are spreadsheet rows, not earlier Q numbers.

These answers supersede contradictory Week 7 working assumptions, not dated evidence of previous behaviour. Jira CS-76 owns remaining decisions and CS-77 the shared API/lifecycle design.

## Remaining decisions

- Rows 4/6: buffers cannot be changed once set versus once venue confirmed. Confirm the exact lock point and initial configuration of existing venues. Unrestricted edits are not accepted Session 3 behaviour.
- Row 10: confirm whether requesting a venue is the Coordinator confirmation action or whether an additional action is required before Staff approval.
- Rows 25/26: define Event registration capacity and attendee allocations without blindly summing rooms; attendee visibility beyond the primary location needs a consistent projection.
- Rows 33/41: record supervision scope and decide cross-Lead reassignment/scope transfer behaviour.
- Rows 28/31/32: numerical buffer maximum, valid hold durations/extensions/caps and warning timing need justified team decisions. Customer permits non-negative buffers and explicitly delegates hold period and warning timing.

## Authoritative answer transcript

### G8 row 2

**Question:** May I confirm that the updated event lifecycle is the following:Draft → Submitted (Unassigned queue) → Assigned / Under Review → Planning → Venue & Tech approved → Pending Safety Check → Confirmed → Preparation → Completed, plus Returned, Rejected and Cancelled?

**Answer:** Yes -Safety approval is required before Confirmed, followed by Preparation and Completed. Returned, Rejected and Cancelled are separate outcomes

### G8 row 3

**Question:** In particular, is an event "Confirmed" before or after the Safety Officer approves it, and is "Preparation" a separate status?

**Answer:** Confirmed is after the Safety Officer approves the operational safety check. Preparation is a separate status/stage and cannot begin until that approval

### G8 row 4

**Question:** Who sets and changes a venue's setup and turnaround times: Venue Staff or the Event Coordinator? Can they be adjusted for one event (for example, a complex layout needs extra setup), or are they always fixed per venue?

**Answer:** Venue Staff maintain each venue’s configurable setup and turnaround defaults. Once set can't be updated/adjusted.

### G8 row 5

**Question:** Can one event's turnaround overlap with the next event's setup at the same venue? Or must Event B's setup start only after Event A's turnaround has fully ended?

**Answer:** The venue is occupied from the beginning of setup through the end of turnaround. A later booking’s setup may start when the earlier booking’s turnaround ends, but will not overlap that interval. Availability and conflict checks use these effective intervals, not just advertised event times.

### G8 row 6

**Question:** When a change to setup or turnaround times creates a conflict with existing bookings, who is notified (Venue Staff, the Coordinator, or both), and who has to resolve it? Does the affected event change status (for example, back to Planning), or keep its status with a warning flag?

**Answer:** They cant be changed once venue is confirmed

### G8 row 7

**Question:** Besides the Coordinator, should the Event Organiser also be told that their venue is affected? Should attendees be told at this stage, or only once the replacement is confirmed?

**Answer:** Yes - Notify the Event Organiser that their venue arrangement is affected and explain the next action.

Do not notify attendees about an unresolved internal booking issue; notify them when a replacement or other material change is confirmed and attendee-facing details change.

### G8 row 8

**Question:** If no suitable replacement can be found, what happens to the event? Does the Coordinator cancel it, or reject it? Is there a deadline for finding a replacement?

**Answer:** The system will not automatically cancel or reject the event when no replacement is immediately available. Coordinator work with the Organiser on alternatives. If no alternative found then Event can be cancelled by Event Coordinator

### G8 row 9

**Question:** If the original venue becomes available again before a replacement is confirmed, can the event go back to its original booking?

**Answer:** Yes, if the original venue is available for the full effective interval and Venue Staff confirm that the booking can be restored.

### G8 row 10

**Question:** What is the "required action" that turns a hold into a confirmed booking: Venue Staff approval, the Coordinator confirming the event, or something else?

**Answer:** Coordinator confirm the hold venue and in inform venue staff. Venue staff will approve it.

### G8 row 11

**Question:** When a hold expires, what happens to the event in terms of the event lifecycle? Does it go back to Planning? Are any linked equipment reservations also released?

**Answer:** The Event Coordinator should be informed before or when the hold expires, and an expired hold should not be treated as a confirmed booking.

By default a event is in planning state until the venue and equipment not confirmed. (New change put hold on Venue not on equipments)

### G8 row 12

**Question:** Previously, coordinators were auto-assigned by the system, and a coordinator could start a reassignment after agreeing it offline. Does the Lead's manual assignment fully replace auto-assignment, or should the system still suggest a coordinator (for example, by workload)? Can coordinators still start reassignments, or now only the Lead?

**Answer:** Manual assignment by the Event Coordinator Lead replaces automatic assignment for new requests.

Coordinators may ask the Lead to reassign an event, but cannot directly transfer it.

### G8 row 13

**Question:** Is the Lead view-only over events, or can they also act as a coordinator (approve, reject, confirm), including assigning events to themselves?

**Answer:** Lead can review assignment/active-event information and assign or reassign events to Coordinator. They do not put hat of Coordinator

### G8 row 14

**Question:** When an event is reassigned partway through planning, does everything (pending venue and equipment requests, holds, comments) move to the new coordinator? Should the Organiser be notified of the change?

**Answer:** All event-linked records stay attached to the event and become available to its new Coordinator, including pending venue/equipment requests, holds, comments and history. Notify the Organiser, previous Coordinator and new Coordinator of a reassignment.

### G8 row 15

**Question:** When a returned request is resubmitted, does it go back to the same coordinator or back into the Unassigned queue?

**Answer:** A returned request remains assigned to its current Coordinator. When the Organiser resubmits it, it returns to that Coordinator for review rather than going back to the Unassigned queue. The Lead can reassign it if staffing has changed or the Coordinator is unavailable.

### G8 row 16

**Question:** After a significant change (for example, more attendees or a replacement venue) on an event the Safety Officer has already approved, is a new safety check required?

**Answer:** Any change that affect confirmed event will be requested and reviewed by Coordinator and will go through a standard event lifecycle. If coordinator accepted the change as stated in previous session that event status will be updated from current state to planning/reviewing state.

### G8 row 17

**Question:** Should the review be a structured checklist covering the listed factors (attendance, capacity, emergency access and so on), or one decision with free-text comments? Can the Organiser see the safety outcome and comments?

**Answer:** Use a structured review checklist for the factors named in the change notice (attendance/capacity, layout, emergency access, accessibility, equipment placement, and venue restrictions), with comments and one outcome: approve, reject the safety arrangement, or request changes. Show the Organiser the outcome and actionable comments, but not private internal notes.

### G8 row 18

**Question:** Do we need a separate role to manage user authentication, or should an existing role (such as the Event Coordinator lead) handle it? Who is in charge of creating internal users, assigning or changing their roles, and deactivating them?

**Answer:** No separate System Administrator role is introduced by the Week 7 changes. The earlier clarification remains: external Organisers/Attendees sign up themselves, while internal accounts/roles are managed through the system’s existing internal setup/defaults. The Lead manages event assignments, not user authentication or account administration.

### G8 row 19

**Question:** Is the Event Coordinator Lead responsible for adding users? If so, only the coordinators under them, or all internal staff (Venue Staff, Technical Support, Safety Officers)?

**Answer:** No. The Lead is responsible for event-request and Coordinator assignments, not for creating or administering all internal users.

### G8 row 20

**Question:** Does the Lead create accounts directly in the system, or raise a Jira request to Technical Support to set up the account? In this system, "Technical Support Staff" handle event equipment, not IT. Do you mean that team, or a separate IT team outside the system?

**Answer:** Lead do not create new account.

### G8 row 21

**Question:** External users currently sign up themselves. Is there any case where the Lead needs to add external users (for example, onboarding a new client organisation)?

**Answer:** No. External users continue to register for their own accounts. The

### G8 row 22

**Question:** When an internal user is deactivated or leaves, what happens to events assigned to them? Should the Lead have to reassign them before the account can be deactivated?

**Answer:** Before deactivation, the Lead should reassign every active event to another Coordinator. Do not leave active work assigned to an inactive user.

### G8 row 23

**Question:** Can each venue in a multi-venue event have its own times (e.g. breakouts only in the afternoon), or do all share the event's time?

**Answer:** Yes. Each venue booking in a multi-venue event may have its own date/time window, provided it fits the event’s overall schedule. Check suitability, availability, setup and turnaround independently for each venue and its specific booking interval.

### G8 row 24

**Question:** Can the event be confirmed if some venues are approved and one is rejected, or must every requested venue be approved?

**Answer:** Every required venue booking must be approved before the event can be confirmed. If one venue is rejected, the event remains in planning while the Coordinator arranges a replacement or revises the plan; approved venues remain associated with the event and are not automatically removed.

### G8 row 25

**Question:** Is attendance checked per venue (e.g. 40 per breakout) or the event total against each venue?

**Answer:** The allocations must still account for the expected attendees who need to use the venues, and no venue may exceed its capacity.

### G8 row 26

**Question:** Is there a main venue Attendees should see, or are all venues shown equally?

**Answer:** For multi  venue event, allow the Coordinator to designate one venue as the primary attendee-facing location, while listing the other venues as part of the same event. Attendees see the primary location, Organizer can see all the venue.

### G8 row 27

**Question:** When is cancelling one venue "explicitly required" to also remove the others?

**Answer:** Cancelling one venue arrangement does not cancel the others by default. Remove other venue bookings only when the whole event is cancelled.

### G8 row 28

**Question:** What maximum setup or turnaround time should we allow, and is 0 valid?

**Answer:** Venue Staff configure a non negative value for setup and turnaround time for each venue independently. Each venue may have different Setup & Turnaround time.

### G8 row 29

**Question:** Should equipment reservations also cover the venue's setup and turnaround period?

**Answer:** Week 7 change require to have setup and turn around time only for venue. For equipment yo can assume it availability base on equipment catelog and inventory.

### G8 row 30

**Question:** Does a replacement venue need Venue Staff approval like a new booking?

**Answer:** Yes. A replacement considered a change request will pass through new venue request and all the approval needs to be done.

### G8 row 31

**Question:** What default hold length should we use, and who can extend it, how many times?

**Answer:** The change document requires an expiry but does not set a default or extension limit. Team can dedicde add valid hold period.

### G8 row 32

**Question:** How far before expiry should the Coordinator be warned?

**Answer:** Team can decide. coordinator should be informed

### G8 row 33

**Question:** How many Lead Coordinator(s) will there be? Is there only one Lead Coordinator that oversees all coordinators, or several Lead Coordinators with a team of Event Coordinators each?

**Answer:** System should support one or more Event Coordinator Leads, with each Lead’s supervisory scope recorded. At least one Lead must be available to review the common unassigned queue and oversee assignments; do not hard-code a single Lead account.

### G8 row 34

**Question:** Why does equipment need location when venue and equipment should not block each other? Does the equipment's location affect whether it can be reservce for an event at a different venue or is location only for Technical Support's references?

**Answer:** Equipment location is catalogue/inventory information that helps Technical Support check where equipment is stored and whether it can be delivered in time. It does not reserve or block a venue. Equipment availability is based on quantity, condition

### G8 row 35

**Question:** Can Event Coordinators hand events to each other or only the Lead Coordinator can reassign?

**Answer:** Only the Lead performs the reassignment in the system.

### G8 row 36

**Question:** Can Lead Coordinator hold double role as a Event Coordinator too (i.e. Lead Coordinator can also approve or reject requests)

**Answer:** Refer row 13

### G8 row 37

**Question:** New requests now go to an unassigned queue. Should auto-assignment be removed completely, or kept as a suggested Coordinator that the Lead can accept?

**Answer:** Yes, no auto-assingment.

### G8 row 38

**Question:** Should events already auto-assigned stay with their Coordinator?

**Answer:** Yes. Keep existing assignments; Week 7 changes the handling of newly submitted requests and does not require resetting work already assigned. The Lead can reassign an existing event when needed and should notify the affected users.

### G8 row 39

**Question:** Can only the Lead reassign events, or can the assigned Coordinator still hand an event over?

**Answer:** Only the Lead changes the assignment. The Coordinator may request a transfer, but may not hand the event over directly; the Lead reviews and performs any reassignment.

### G8 row 40

**Question:** Is the Lead also a Coordinator? Can they assign events to themselves and manage them directly?

**Answer:** Refer row 13

### G8 row 41

**Question:** Does the Lead see all active events, or only a team of Coordinators? Can there be more than one Lead?

**Answer:** The Lead should see all unassigned and active events that he/she previously assigned to event coordinator.

### G8 row 42

**Question:** What should the Organiser see in the "Event Coordinator" row before assignment, for example "Awaiting assignment"?

**Answer:** “Unassigned --> Coordinator name”

### G8 row 43

**Question:** Who is notified of assignments and reassignments: the new Coordinator, the previous Coordinator, the Organiser, or all three?

**Answer:** For a new assignment, notify the newly assigned Coordinator and the Organiser.

For a reassignment, notify the new and previous Coordinators and the Organiser.

Record the Lead’s action; notify other Leads only if they are responsible for that queue/supervisory scope.(I leave up to development team.You can consider or ignore to implement)

### G8 row 44

**Question:** Is the safety check before Confirmed, or between Confirmed and "preparation"? Is "preparation" a new status?

**Answer:** Refer row 2

### G8 row 45

**Question:** Should staff preparation updates unlock only after safety approval, instead of after the venue/technical sign-off?

**Answer:** Yes. Venue Staff and Technical Support preparation updates become available only after the Safety Officer approves the event and it enters Preparation.

### G8 row 46

**Question:** When the Safety Officer requests changes, which status does the event return to? Are venue/technical sign-offs reset automatically, or does the Coordinator decide?

**Answer:** At this stage event still in planning. and remain in planning until all approval done.

No auto assing or reset. Event coodinator will do the changes if necessary

### G8 row 47

**Question:** Does a safety rejection reject the whole event, or only the safety arrangement so the Coordinator can revise it?

**Answer:** A safety rejection applied on venue for its suitability for the event. Safty rejection reject the venue not the entire event request. Keep the event in planning with the safety issue and reason visible to the Coordinator; allow revised arrangements and another safety review. The Coordinator may separately reject/cancel the event only under the normal event decision process.

### G8 row 48

**Question:** If attendance or layout changes after safety approval, does the safety check need to be done again?

**Answer:** Refer row 16

### G8 row 49

**Question:** Which event details can the Safety Officer see, including change history? Are they assigned to specific events, or does any Safety Officer review any event?

**Answer:** The Safety Officer should see the event details needed for the review and the relevant change history, including attendance, venue/layout, access and equipment changes. Reviews should be routed through a safety-review queue or assigned to an authorised Safety Officer; they should not receive unrestricted access to unrelated event information. Record who reviewed each check.

### G8 row 50

**Question:** Does each venue need its own sign-off and its own venue preparation status, or is there one for the whole event?

**Answer:** Yes. Each venue booking has its own approval and availability state, and venue preparation progress is tracked per venue. The event-level readiness/confirmation state is an aggregate: it cannot be confirmed or prepared until every required venue and technical arrangement is ready and safety is approved.

### G8 row 51

**Question:** Should a significant change reset all venue sign-offs, or only those for the affected venue?

**Answer:** There is no automatic reset for any venue/equipemnt affected by a change.  Coordinator will review the changes and decide next action.

### G8 row 52

**Question:** When a booked venue becomes unavailable, should its sign-off and preparation reset, and should the event move back to Planning?

**Answer:** Even Coordinator review the unavailability of the veneu and decide next action. New venue request will go through entire approval process.  and event goest to planning phase.

### G8 row 53

**Question:** Should Organisers see each venue separately, and see when one becomes unavailable?

**Answer:** Yes. Organisers should see each venue in the event separately, including its status and any unavailability that affects their plans, together with the next action.

