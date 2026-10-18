# Sprint 3 progress and design handoff

Prepared 14 October 2026 for [CS-96](https://spmg8.atlassian.net/browse/CS-96). This is the usable update routine and requirement annotation pack. It records source implementation and supporting evidence; actual team adoption, joint design review and PO acceptance must be recorded when they occur.

Use the [policy register](../venue-policy-decisions.md), [Session 3 customer transcript](../session3-decisions.md), current Jira ACs and [reviewer walkthrough](reviewer-walkthrough.md) together. The preceding implementation baseline is [d4c40a9](https://github.com/aryan12singh/connectsphere/tree/d4c40a99987a43f2f675a2aace4b4c3afbe8a42b), with [eight passing CI jobs](https://github.com/aryan12singh/connectsphere/actions/runs/38539513763), 342 frontend tests and 70 desktop/mobile browser tests. This 14 October continuation's final local result is **353/353 frontend tests and eight corrected Venue desktop/mobile checks**; the preceding local venue workflows22/22 and restart1/1 also passed. The first hosted run at f79eb6a exposed a real mobile retry defect at73/74, now corrected and independently re-reviewed. Preserve that failed run and require a fresh full74-case hosted run for the correction. Earlier green CI does not verify this continuation's new revision; record its commit and hosted result in the delivery report.

## Update routine through the Sprint 3 end

The Scrum Master checkpoints are **17 October and 20 October 2026, 18:00 SGT**, before the 21 October Sprint 3 end. Each developer updates their own Jira cards and links the corresponding dated DEVLOG/test evidence before the checkpoint. Record an earlier update whenever a blocker changes; do not wait until the checkpoint to identify a dependency. The Scrum Master checks for missing updates and consolidates blockers, owners and the next check time. A personal reminder for Aryan is separate from sending reminders to the team; no team notification or peer participation is recorded here.

| Owner | Scope | Update responsibilities |
| --- | --- | --- |
| Marc | Frontend and notifications | Current screen/Figma state, integration needs, CS-10 Officer access and CS-50/51 delivery evidence. |
| Aryan | Venue and operations Safety | CS-36/37/38/39/84/85/86/87 implementation/evidence; CS-93/94/95 integration blockers; CS-74/76/78/96 artifacts and review gates. |
| Javier | Event | CS-77 review-round/lifecycle/private API decisions, assignment/requirements changes and current Event projections. |
| Alan | Equipment and attendee | CS-42 current technical/support proof or explicit `NOT_REQUIRED`; registration/public room projection integration. |

Copy this block into the developer's Jira progress comment and link the dated entry under `docs/devlogs`:

```text
Sprint 3 update — [date/time SGT] — [owner]
Tickets: [CS keys]
Delivered since last update: [behavior, branch/commit and links]
Verified: [test cases/layers, actual result, CI/evidence link]
Next before [date/time]: [concrete deliverable]
Blocked: [dependency ticket, owner, needed contract/decision, next check]
Design/AC change: [Figma frame/annotation and Jira requirement, or none]
Review/acceptance: [requested/completed, actual reviewer/PO evidence]
```

Keep RED/failed execution history. Link the final dated result without rewriting an old result; record UI, API and database evidence only where the case requires it. Automated checks, a prepared document or a design note do not imply a human review occurred.

| Checkpoint | Actual updates received | Blockers/owners/next check | Scrum Master reconciliation |
| --- | --- | --- | --- |
| 17 October, 18:00 SGT | | | |
| 20 October, 18:00 SGT | | | |
| 21 October Sprint end snapshot | | | |

## Shared Figma reference and annotation workflow

The supplied [ConnectSphere design file, node 3:7](https://www.figma.com/design/PpSLNWECjmrIWIeKzygaXg/spm-connectsphere-design?node-id=3-7) matches links retained in the Drive snapshot's Sprint 1 review and Sprint 2 planning documents. On 14 October the connector's inspection/metadata/screenshot operations rejected access, but the existing **native Figma session successfully allowed reading the pages and posting comments**. Requirement/evidence comments were published and read back on the existing pages below. No canvas pages, frames or layouts were created, edited or removed; created/mutated canvas node IDs: **none**. The comments are annotations for designer adoption, not PO approval or a changed design implementation.

| Published comment | Existing page / node link | Requirement coverage and verification |
| --- | --- | --- |
| #1 | [Page 11 — buffers, node 268:2559](https://www.figma.com/design/PpSLNWECjmrIWIeKzygaXg/spm-connectsphere-design?node-id=268-2559) | CS-84/85/86; published comment and native readback verified. |
| #2 | [Page 12 — search/multiple rooms, node 270:2](https://www.figma.com/design/PpSLNWECjmrIWIeKzygaXg/spm-connectsphere-design?node-id=270-2) | CS-36/39/87; published comment and native readback verified. |
| #3 | [Page 13 — holds and decisions, node 270:2731](https://www.figma.com/design/PpSLNWECjmrIWIeKzygaXg/spm-connectsphere-design?node-id=270-2731) | CS-37/38/85; published comment and native readback verified. |
| #4 | [Page 15 — Safety, node 271:2](https://www.figma.com/design/PpSLNWECjmrIWIeKzygaXg/spm-connectsphere-design?node-id=271-2) | CS-93/94/95; published comment and native readback verified, with live preparation versus blocked Officer/rework integration explicit. |

The native accessibility readback contains comments #1–#4 and their bodies. Screenshot captures are `figma-CS84-CS86-annotation.png`, `figma-CS36-CS87-annotation.png`, `figma-CS37-CS38-annotation.png` and `figma-CS93-CS95-annotation.png` in `PROJECT/sprint3-evidence/2026-10-14-review-preparation/local-verification/`; these captures are retained outside Git. These are comment-mode annotations; no canvas node IDs were changed.

The nine-screen pack below supplies the full visible-data/state checklist behind those comments. The designer/PO should review it against the existing frames and incorporate agreed annotations using the file's conventions, retaining existing UI/layouts. Commenting does not deliver outstanding screen designs. Do not present the Safety component notes as a live Officer workflow.

For each annotation, include:

```text
[CS key / AC or TC IDs] — [screen/state] — [date]
Requirement and authority: [customer row / later PO direction / team decision]
Visible data: [the fields listed below]
Behavior: [normal, empty, validation, permission, loading, error, mobile]
Implementation/evidence: [source, revision, dated test/UI/API/DB link]
Integration dependency: [CS key/owner, or none]
PO review: [blank until actual review; reviewer/date/decision afterwards]
```

For later canvas annotations, record the actual page/frame/note IDs and links, verify the text and take one screenshot showing readable notes beside the intended frame. The pack describes delivered behavior plus explicit design states to inspect; unverified states must remain proposed or pending in Figma.

## Annotation pack

### Venue catalogue and details — CS-84 / CS-96

Source: [VenueWorkspace](../../frontend/app/components/venue/VenueWorkspace.vue), [VenueDetails](../../frontend/app/components/venue/VenueDetails.vue), [catalogue route](../../frontend/app/pages/venue/index.vue).

- **Visible data:** venue name/address or virtual venue, active flag, physical capacity, venue ID/type, supported layouts, facilities, accessibility tags, setup/turnaround minutes, current page/total and latest three history entries (time/actor/reason), expandable to the full returned history.
- **Normal:** select a venue, inspect its calendar and catalogue facts; navigate real six-venue pages and expand/collapse returned history. Staff manage controls depend on permissions. **Empty:** “No venues available” or “No venues match your search”; history explicitly shows “No version history available.” **Validation:** search resets page1, removed results clamp page within the current total and Previous/Next disable at boundaries; deletion rejects server-invalid state.
- **Permission:** `venues.view`; create/edit/delete require `venues.manage`; Staff request/conflict tabs are role/permission gated. **Loading:** controls disabled before hydration; annotate any catalogue fetch indicator as a design requirement, since there is no distinct catalogue skeleton. **Error:** route availability message and error alert; do not show unavailable data as current. **Mobile:** single-column selection/details; long IDs wrap, card titles truncate and inner calendar scrolls.
- **Catalogue and history controls:** sidebar Previous/Next now pages six matching venues with real bounds, search reset, refresh clamping and an explicit no-results state. “Show full history” expands the permitted fetched audit records and “Show recent history” restores three rows. Expansion resets for a different venue; the button stays disabled before hydration. TC-CS33-14/15 record the component and production-browser checks; these controls do not fetch or expose an unauthorized history source.

### Venue form and coordinated initial buffers — CS-84

Source: [VenueForm](../../frontend/app/components/venue/VenueForm.vue), [new route](../../frontend/app/pages/venue/new.vue), [edit route](../../frontend/app/pages/venue/%5Bid%5D.vue). Evidence: TC-CS84-30/39/41 in [CS-84 records](../../tests/records/CS-84).

- **Visible data:** name, address, capacity, type, independent setup/turnaround minutes, layouts/facilities/accessibility, operating weekdays/open/close, time zone, active flag and change reason. Legacy section adds proposed initial minutes, each affected Event title, two communication acknowledgements, per-Event note and configuration reason; current Coordinator/Organiser identity and booking versions are retained in the server audit/context.
- **Normal:** Staff may edit buffers until first successful venue confirmation, then ordinary edits lock. Eligible pre-policy venues get one coordinated initial configuration; existing approvals remain and conflicts are rechecked. A never-confirmed legacy venue remains editable until its first confirmation. **Empty:** a verified empty affected-Event set explicitly needs no current/future Event communication. **Validation:** independent whole minutes 0–480, mandatory trimmed reason and both acknowledgements plus note for every affected Event; changing either minute value clears acknowledgements/notes.
- **Permission:** `venues.manage`; matching-version server permission controls ordinary locked-fence recovery, and missing proof stays closed. **Loading:** form disabled before hydration/while saving; legacy context says “Loading current affected Events…” and cannot save before verification. **Error:** inline field/form errors, stale/dependency failure refreshes current context; approvals/history remain intact. **Mobile:** stacked fields/communication records and wrapping notes; confirm focus/error visibility.
- **Authority:** later PO direction resolves Q1. The recorded chain is Staff attestation that Staff informed the current Coordinator and that Coordinator informed Organiser; it does not prove an external conversation. No per-booking buffer override or post-confirmation free edit is introduced.

### Availability calendar and operational closures — CS-39 / CS-85

Source: [VenueCalendar](../../frontend/app/components/venue/VenueCalendar.vue). Evidence: TC-CS39-30 and TC-CS85-30 in their [dated records](../../tests/records).

- **Visible data:** venue/time zone, day/week/date, opening hours, advertised booking start/end/title/status, setup/turnaround shading, occupied-window tooltip, pending-request count; form includes Event/title/start/end/status/reason.
- **Normal:** availability, search and writes use the whole occupied interval; exact touching is allowed, positive overlap blocked. Staff can record operational unavailable/blocked windows; existing affected commitments are flagged, retained and require review. **Empty:** a free calendar is not an approved booking. **Validation:** valid unambiguous local times, end after start, required Event/reason and conflicts; no ordinary conflict override.
- **Permission:** current Coordinator versus Staff operational-status rules; approved commitments are read-only where required. **Loading:** hydration controls disabled; do not interpret a pending fetch as proven availability. **Error:** availability/save error alerts; stale saved state requires fresh server reads before retry. **Mobile:** intentional keyboard-focusable horizontal calendar scrolling, readable tooltip/booking form and touch-accessible controls; no page-wide overflow claim.

### Coordinator venue search and alternatives — CS-36 / CS-87

Source: [EventVenueArrangements](../../frontend/app/components/venue/EventVenueArrangements.vue). Evidence: TC-CS36-30, CS36-03/10 and TC-CS87-13/14/17/20/21.

- **Visible data:** current Event/room identity, independent room dates/times, attendance/layout, facilities/accessibility/location filters, candidate name/address/capacity, setup/turnaround and occupied start/end, full/partial classification, unmet needs and request availability.
- **Normal:** Event needs prefill new-room search; an alternative uses the selected room's needs. Search does not create a hold; eligibility is checked again on request. Physical/hybrid capacity is mandatory even for partial results. **Empty:** no matching candidates is explicit. **Validation:** room interval within Event, attendance/capacity/layout/suitability; changed criteria or current Event/room version invalidates stale matches.
- **Permission:** only current assigned Coordinator in Planning (`ARRANGEMENT_PENDING`) can arrange; approved-room alternatives remain assessment until the relevant reviewed replacement workflow. **Loading:** “Searching…” and disabled duplicate action; pending results cannot restore actionable stale criteria. **Error:** request/search error plus authoritative refresh; preserve edited criteria for a deliberate retry. **Mobile:** stacked criteria/candidates and wrapping gap labels/actions.

### Room request, hold and extension — CS-37 / CS-87

Source: [EventVenueArrangements](../../frontend/app/components/venue/EventVenueArrangements.vue). Evidence: TC-CS37-30 and TC-CS87-13/29.

- **Visible data:** room/Event/booking ID, read version, attendees/layout, advertised and occupied interval/time zone, hold deadline/countdown, request reason, extension requested deadline/reason and used-extension state.
- **Normal:** request creates a tentative hold; omitted initial deadline derives 72 hours capped at setup. Current Coordinator requests one extension up to24 hours, Staff decides; pending extension leaves current expiry unchanged. **Empty:** “No venues requested yet.” **Validation:** reason, future valid deadline never beyond setup, current version and one-extension allowance; explicit invalid/null initial deadline is rejected.
- **Permission:** current assignment and Planning state; Coordinator cannot approve their own hold/extension. **Loading:** disable duplicate requests/mutations while posting; ambiguous failure retains retry identity. **Error:** stale/unavailable/expired state is refreshed; show “Expired — request a new hold” at the deadline and stop acting on it. **Mobile:** stacked extension/release fields and wrapping IDs.
- **Boundary:** automatic effective expiry is delivered; CS-90 scheduler and CS-50/51 actual notice delivery remain separate. Q2 was resolved on 17 October: Coordinator requests a tentative hold, then Staff approval confirms it; no extra Coordinator confirmation control is required. See the [current integration handoff](../sprint3-integration-handoff.md) for the integrated worker/delivery beyond this earlier design snapshot.

### Staff requests and decisions — CS-38

Source: [VenueBookingRequests](../../frontend/app/components/venue/VenueBookingRequests.vue). Evidence: TC-CS38-30.

- **Visible data:** Event/venue/booking ID, Organiser/current Coordinator/requester, attendance/capacity/layout, advertised/occupied times, buffer minutes, deadline/time zone, facilities/accessibility/current venue notes, request reason, flags and extension request.
- **Normal:** Staff approves/rejects with reason, or approves current Coordinator's requested extension. Venue approval is separate from parent Event confirmation. **Empty:** no requests awaiting review. **Validation:** mandatory reason/current version, active hold and no unresolved suitability/conflict flag for approval; invalid requests cannot force a decision.
- **Permission:** authorized Venue Staff/`venue_bookings.decide`, not Coordinator or Lead acting as Staff. **Loading:** no decision before hydration or while any decision saves. **Error:** stale/expired/dependency refusal refreshes the request and shows an error. **Mobile:** stacked request facts and wrapping action buttons; reason remains visible beside the action.

### Conflict investigation and automatic rechecks — CS-39 / CS-86

Source: [VenueConflicts](../../frontend/app/components/venue/VenueConflicts.vue). Evidence: TC-CS39-30 and TC-CS86-03/30.

- **Visible data:** flagged Event/venue/booking and status, flags, both affected occupied windows/current Coordinator IDs, Event links, current venue buffers/version, checked time in API evidence and recheck reason/result count.
- **Normal:** show both commitments side by side; durable recheck updates flags/history without deleting commitments, resetting approvals or cancelling the Event. Manual recheck uses current Venue version and reason. **Empty:** no current conflict/outstanding suitability flags. **Validation:** mandatory reason/version; a conflict acknowledgement never authorizes an overlapping new commitment.
- **Permission:** Staff conflict workspace; current authorization still checked by server. **Loading:** hydration/recheck disables concurrent actions. **Error:** unavailable report explicitly requests refresh; no false “no conflicts” from failed fetch. **Mobile:** conflict list and panes stack; long booking IDs and labels wrap.
- **Boundary:** recheck intent is delivered; real recipient notice delivery and downstream reviewed replacements belong to peer work.

### Independent rooms, primary location and allocations — CS-87

Source: [EventVenueArrangements](../../frontend/app/components/venue/EventVenueArrangements.vue). Evidence: TC-CS87-13/25/28/29.

- **Visible data:** Event attendance, each room's independent ID/version/status/time/layout/headcount/flags/deadline, per-session allocation totals/reasons, aggregate venue readiness/outstanding reasons and selected primary room.
- **Normal:** separate requests/approvals; all required rooms must be currently suitable/approved. Simultaneous disjoint allocations must total Event attendance; sequential rooms do not increase Event capacity. Primary selection is versioned and never publishes/confirms Event. **Empty:** no rooms or primary selection prompts. **Validation:** room capacity, current intervals and allocation totals; under/over-allocation blocks readiness without resetting approvals.
- **Permission:** current assigned Coordinator; unrelated users/Staff cannot choose the primary on behalf of Coordinator. **Loading:** no repeated select/move/release; matching current Event projection required. **Error:** stale/readiness failure refreshes authoritative summary, retaining independent sibling approvals. **Mobile:** room cards, status/actions and allocation lines stack/wrap.
- **Boundary:** attendee/Organiser publication and shared registration command persistence remain peer integration; do not present combined room capacity as a registration limit.

### Safety preparation, Officer and rework foundations — CS-93 / CS-94 / CS-95

Sources: [CoordinatorSafetyPreparation](../../frontend/app/components/safety/CoordinatorSafetyPreparation.vue), [SafetyReviewDetails](../../frontend/app/components/safety/SafetyReviewDetails.vue), [SafetyDecisionForm](../../frontend/app/components/safety/SafetyDecisionForm.vue), [SafetyReworkPanel](../../frontend/app/components/safety/SafetyReworkPanel.vue).

- **Visible data:** venue readiness/outstanding reasons; per-room attendance/capacity/layout/emergency access/accessibility/equipment placement/crowd movement/restrictions; equipment status/list. Component foundations add current round/requirements revision, reviewed checklist, decision, actionable comments, affected areas/rejected booking IDs, private notes and readiness/rework status.
- **Normal:** live Coordinator preparation shows known venue facts; unknown technical/Safety factors remain unverified. Component decision/rework behavior requires current authorized proof. **Empty:** no rooms, unknown factors “Not recorded,” missing equipment is `UNVERIFIED`, never approval/`NOT_REQUIRED`. **Validation:** complete reviewed checklist; actionable Reject/Request Changes comments; rejected venue target or affected areas; current review-round/revision/Coordinator rework review.
- **Permission:** private notes internal, shareable outcome/actionable comments separately; Officer/current-assignment authorization must come from server, not a component flag. **Loading:** disabled while pending/pre-hydration; repeated emitted decision/resubmission suppressed. **Error:** stale round/revision or dependency data disables actions; display current request error and require refresh. **Mobile:** checklist, factor grid, comments and feedback cards wrap/stack.
- **Delivered versus blocked:** the preparation panel is live and “Send for Safety Check” is disabled. CS-94/95 are tested component foundations, not a production Officer queue or persistent decision/resubmission endpoint. Full flows depend on Marc CS-10 roles, Alan CS-42 current technical/support proof, Javier CS-77 private round/commands/lifecycle/privacy, and Marc CS-50/51 delivery. Safety approval precedes Confirmed; Preparation is a separate later stage. Rejection targets venue arrangement, Event remains Planning and unrelated approvals are retained until Coordinator-directed review.

## Adoption and review record

Leave these records blank until the named people actually act. A prepared pack is not proof of adoption, human execution or PO acceptance.

| Required action | Actual owner/reviewer, date and evidence |
| --- | --- |
| Existing Figma page access and comment readback | 14 October 2026; native session read/comment verified for #1–#4 at the linked nodes above, with screenshot captures. No canvas edits. |
| Designer incorporates the nine-screen pack into frame annotations; actual note IDs and screenshot readback | |
| PO checks visible fields/states against requirements | |
| Marc checks frontend design alignment and state gaps | |
| Each developer acknowledges and posts first async update | |
| 17/20 October checkpoints actually used and missing updates reconciled | |
| CS-74 independent model review | |
| CS-78 timebox/spike review | |
| Venue human walkthrough and story acceptance | |
| Q2 clarification received and impact reconciled | 17 October 2026; Aryan confirmed Coordinator tentative request → Staff approval, with no extra Coordinator button. [Decision and verification](../devlogs/2026-10-17-venue-confirmation.md); human story acceptance remains separate. |

Apply the [Definition of Done](../DEFINITION_OF_DONE.md). Keep implementation/evidence, actual review, main integration/CI and PO acceptance distinct; record the Sprint end snapshot before carrying remaining work forward.
