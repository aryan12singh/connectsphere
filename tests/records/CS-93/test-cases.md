# CS-93 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS93-30 covers current coordinator preparation factors. Preconditions and steps: Real approved venue and existing summary; open Safety factor details. Expected result: Actual per-room80/120 shown; unknown factors labelled; unverified Technical/Safety submission stays disabled. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-93](https://spmg8.atlassian.net/browse/CS-93), reconciled with the [Session 3 customer answers](../../../docs/session3-decisions.md), rows2–3/17/45–51, on 14 October 2026. The current acceptance criteria below supersede contradictory historical examples. CS-77 owns the reviewed API/state mapping; execution records identify actual services versus isolated fixtures. Specifications alone do not establish execution or acceptance. Q2 was resolved on 17 October: the Coordinator requests a tentative hold and Venue Staff approval confirms that venue booking, without an extra Coordinator action. Whole-Event Safety approval, Confirmed and separate Preparation retain their existing ordering.

## Acceptance criteria

1. After every required current venue booking is approved and technical/support arrangements have current approval/reservation proof or explicit `NOT_REQUIRED`, the current assigned Coordinator can submit a versioned safety review. The event remains in Planning while approvals are outstanding and its review reflects Pending Safety Check. Exact stored state names follow the reviewed CS-77 contract.
2. Until then, the action is disabled and the outstanding arrangements are listed. Missing, unknown or stale technical proof never counts as approved or not required.
3. The review is routed through an authorized Safety Officer queue/assignment, with relevant change history and seven factors: attendance against each venue's capacity, layout, emergency access, accessibility requirements, equipment placement, crowd movement and venue restrictions. Unknown facts are explicit; room capacities are not summed and access to unrelated event information is denied.
4. Pending-review arrangements cannot bypass controlled change handling. A significant accepted change follows Coordinator review and the standard event lifecycle, returning affected event work to Planning/review. Current review evidence is invalidated or superseded as necessary; no venue or equipment approval is automatically reset. Routine unrelated edits follow CS-43.
5. Safety Officers are notified when an event enters the queue.
6. Safety approval is required before Confirmed. Preparation is a separate stage after confirmation, and Venue Staff/Technical Support preparation updates unlock only once current safety approval exists and the event enters Preparation. Every required venue and technical arrangement must remain ready; submission itself never confirms the event.

## Preserved source cases — historical snapshot

The raw rows below retain their original examples byte-for-byte. They are historical source proposals, not current policy or execution results. In particular, TC-CS93-06's blanket edit lock and the provisional lifecycle wording in the PM rows must be interpreted through the current acceptance criteria and [Safety integration boundary](../../../docs/safety-ui.md). Do not implement an automatic sign-off reset from an older example.

| TC ID | Type · Level | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS93-01 | Happy path · Integration | AC1, AC5 | Send a ready event for safety check | seed_base + fx_ready (E1 PLANNING; B1, B2 APPROVED; equipment APPROVED) | POST /events/E1/safety-check as C1 | — | 200; PENDING_SAFETY_CHECK; S1 notified | A1 assertEqual(res.status_code, 200) A2 assertEqual(db.event("E1").status, "PENDING_SAFETY_CHECK") A3 assertTrue(notify.sent(to="S1", event="E1")) | A1/A2 transition works. A3 Safety Officer learns of it (catches silent queue). | Not Executed |
| TC-CS93-02 | Happy path · Integration | AC1 | No equipment needed | E1 PLANNING; B1 APPROVED; equipment NOT_REQUIRED | POST /events/E1/safety-check as C1 | — | 200 | A1 assertEqual(res.status_code, 200) | A1 "not required" counts as ready (catches equipment always demanded). | Not Executed |
| TC-CS93-03 | Workflow · E2E | AC2 | Button enables when the last item clears | E1 with B2 pending; C1 and VS1 browsers | C1 opens E1 2) VS1 approves B2 3) C1 refreshes | — | Disabled with B2 listed, then enabled | A1 assertTrue(page.get_by_role("button", name="Send for Safety Check").is_disabled()) A2 assertIn("B2", page.inner_text("#outstanding")) A3 assertTrue(page.get_by_role("button", name="Send for Safety Check").is_enabled()) | A1/A2 user sees why it's blocked. A3 unblocks without manual reconcile. | Not Executed |
| TC-CS93-04 | Cross-cutting · Integration | AC1 | Organiser can't send for safety | fx_ready | POST /events/E1/safety-check as O1 | — | 403 | A1 assertEqual(res.status_code, 403) | A1 Coordinator-only action. | Not Executed |
| TC-CS93-05 | Negative · Integration | AC6 | Can't confirm while pending | E1 PENDING_SAFETY_CHECK | POST /events/E1/confirm as C1 | — | 409 SAFETY_PENDING | A1 assertEqual(res.status_code, 409) A2 assertEqual(res.json()["code"], "SAFETY_PENDING") | A1/A2 safety gate enforced (customer: cannot proceed until approved). | Not Executed |
| TC-CS93-06 | Negative · Integration | AC4 | Arrangements locked while pending | E1 PENDING_SAFETY_CHECK | PATCH /venue-bookings/B1 as C1 | start 11:00 | 423; unchanged | A1 assertEqual(res.status_code, 423) A2 assertEqual(db.booking("B1").start, t("10:00")) | A1 edits blocked mid-review (catches reviewing a moving target). A2 no write. | Not Executed |
| TC-CS93-07 | Boundary · Integration | AC1 | n−1 vs n venues approved | E1 with 3 bookings | Send at 2/3 approved 2) Approve 3rd, send again | n = 3 | 409, then 200 | A1 assertEqual(send_2of3.status_code, 409) A2 assertEqual(send_3of3.status_code, 200) | A1 just below: blocked (catches "any venue approved"). A2 at n: allowed. | Not Executed |

## Preserved PM supplemental cases

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-93?focusedCommentId=10121). These unchanged historical source cases remain Not Executed. Their old provisional policy labels are superseded by the current criteria above; exact API/state mapping still requires CS-77. Independent component assertions do not execute these cross-service cases.

| Test Case ID | Type · Level | Source AC / original ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent / reconciliation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS93-08 | Happy path · Integration | CS-32 AC5; 32-02 (Updated) | Safety transitions are logged | fx_ready | 1) Send for safety 2) S1 approves 3) GET history | — | Two ordered transition entries Planning → Pending Safety Check → Safety Approved, each with actor and full timestamp. | Assert exactly the two executed edges in order and actor/time on each; no invented third transition. | A1 new states logged in order. A2 every entry attributable. Safety-before-Confirmed and exact new states remain provisional Q1/Q14; CS-31 owns confirmation orchestration and CS-32 retains original guard baseline. Corrected expected three entries for only two actions. | Not Executed |
| TC-CS93-09 | Negative · Unit | CS-32 AC1, AC2; 32-05 | Draft → Approved is illegal | None (state machine) | 1) Call can_transition("DRAFT","APPROVED") | — | False | A1 assertFalse(can_transition("DRAFT","APPROVED")) | A1 single transition table rejects skips (catches permissive default). Safety-before-Confirmed and exact new states remain provisional Q1/Q14; CS-31 owns confirmation orchestration and CS-32 retains original guard baseline. | Not Executed |
| TC-CS93-10 | Negative · Unit | CS-32 AC1 (+W7); 32-08 (New) | Planning → Confirmed is illegal | None | 1) can_transition("PLANNING","CONFIRMED") | — | False | A1 assertFalse(can_transition("PLANNING","CONFIRMED")) | A1 safety gate can't be skipped (catches old Approved → Confirmed path left in table). Safety-before-Confirmed and exact new states remain provisional Q1/Q14; CS-31 owns confirmation orchestration and CS-32 retains original guard baseline. | Not Executed |
| TC-CS93-11 | Happy path · Unit | CS-32 AC1 (+W7); 32-09 (New) | New legal path | None | 1) can_transition for each step | PLANNING → PSC → SA → CONFIRMED | All True | A1 assertTrue(can_transition("PLANNING","PENDING_SAFETY_CHECK")) A2 assertTrue(can_transition("PENDING_SAFETY_CHECK","SAFETY_APPROVED")) A3 assertTrue(can_transition("SAFETY_APPROVED","CONFIRMED")) | A1–A3 each new edge exists (catches a missing edge blocking the flow). Safety-before-Confirmed and exact new states remain provisional Q1/Q14; CS-31 owns confirmation orchestration and CS-32 retains original guard baseline. | Not Executed |
| TC-CS93-12 | Negative · Unit | CS-32 AC1 (+W7); 32-10 (New) | Changes Requested → Confirmed is illegal | None | 1) can_transition("SAFETY_CHANGES_REQUESTED","CONFIRMED") | — | False | A1 assertFalse(can_transition("SAFETY_CHANGES_REQUESTED","CONFIRMED")) | A1 must go back through planning. Safety-before-Confirmed and exact new states remain provisional Q1/Q14; CS-31 owns confirmation orchestration and CS-32 retains original guard baseline. | Not Executed |

## Independent UI and validation cases

These added component cases deliberately cover only the available UI/validation slice. Original submission, officer authorization, durable decisions/rework/history and inbox cases remain Not Executed until the actual cross-service implementations exist. Component fixtures are explicit proposed display projections, not a new backend contract. Yellow execution records retain the layer and revision.

| Test Case ID | Scenario / AC | Preconditions and steps | Expected result |
| --- | --- | --- | --- |
| TC-CS93-20 | AC1: current Coordinator sees preparation blockers | Mount Event venue component with outstanding venues and unverified technical readiness | Outstanding items visible; Send for Safety Check disabled; no mutation |
| TC-CS93-21 | AC1: venue readiness alone cannot enable submission | All venue arrangements approved; technical readiness unavailable | Technical verification blocker remains; no invented NOT_REQUIRED or Safety success |
| TC-CS93-22 | AC1/2: current Event/assignment visibility | Change Event ID or current Coordinator after loading its venue summary | Safety preparation hides stale/private content |
| TC-CS93-23 | AC2: current Venue type | Hold a Virtual venue, then change the actual Venue to Physical/capacity20 without changing the booking's stored Virtual requirements | Current80/20 and over-capacity warning; no false virtual-capacity exemption |

## 17 October complete service integration

| Test Case ID | Scenario | Preconditions / steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS93-40 | Durable Safety lifecycle and Coordinator-directed rework | Fresh isolated real stack; actual Keycloak accounts; approve venue, submit explicit technical NOT_REQUIRED and obtain Technical Support approval; submit/review/request changes; record Coordinator follow-up; resubmit/approve; confirm, then enter Preparation | Incomplete proof blocked; authorized Officer queue and immutable rounds; no automatic booking reset; Organiser/history contain no private notes; duplicate decision one action; Safety before Confirmed; separate Preparation gates staff updates | Real Kong/auth/PG16/AMQP | 2026-10-17T10:50:00+08:00 |

| TC-CS93-41 | Live readiness and versioned UI command | Mount live preparation with an authorized readiness response and a recording BFF endpoint; click submit | Enabled only for ready proof; sends the displayed Event version once | Component/BFF adapter, not actual persistence | 2026-10-17T11:03:00+08:00 |

### TC-CS93-42 — Safety lifecycle boundary regressions
Date of Creation: 2026-10-17T03:10:00Z
Preconditions: isolated authenticated production-mode services, real PostgreSQL and RabbitMQ; required room and current Technical Support not-required approval.
Steps: complete Safety review and Preparation; omit room identity; record identified room preparation; move an operational closure from another room into the approved room; try confirmation; reject the Event; attempt Coordinator rework.
Expected: unidentified preparation rejected; identified room recorded; destination Safety proof invalidated before closure change, confirmed booking retained; confirmation blocked; rejected Event cannot reopen and is absent from the Officer queue.

### TC-CS93-43 — Required equipment readiness
Date of Creation: 2026-10-17T03:17:00Z
Preconditions: real authenticated disposable production stack with approved required room; Event requires equipment/support.
Steps: approve two-line technical requirements; attempt reserve with insufficient inventory; provide actual stock; concurrently retry reservation using the same action key; inspect readiness; submit Safety; read persisted snapshot.
Expected: approval alone cannot infer equipment readiness; shortfall creates no partial reservation; retry creates exactly one full set; current source-bound reservations and placement appear in Safety proof.


## Integrated acceptance additions — 2026-10-17T03:53:21+00:00

These cases supplement the preserved earlier specifications. Current contracts and the Session 3/PO precedence remain authoritative. Browser IDs can cover several linked story assertions; matching numeric suffixes in the shared sheet do not imply identical scenarios.

| Test Case ID | Requirement / expected result | Execution layer and precondition |
|---|---|---|
| TC-CS93-44 | Terminal/source-stale Safety confirmation is denied; current approved facts permit confirmation; handover metadata preserves sign-offs. | Actual Event module with isolated adapters; no live-locking claim. |
| TC-CS93-45 | With two of three required rooms approved the UI blocks submit; the last approval enables the real current-proof submission. | Production desktop/mobile browser + actual PG; current source needs explicitly require no equipment. |
| TC-CS93-46 | Coordinator submits required equipment; Technical Support changes stock, approves and reserves the complete request; Officer sees the current reserved equipment proof. | Covered across `frontend/e2e/CS-41.spec.ts` (versioned stock change) and `frontend/e2e/CS-42.spec.ts` (reservation, buffered period, and Safety snapshot linkage) on the authenticated production desktop/mobile stack with actual Equipment/Event PostgreSQL. |


## 17 October production mobile stock-entry regression

TC-CS93-48: Coordinator fact-review proof remains stable after display-name edits and asynchronous Booking/Venue version updates, while exact resource-fence proof changes; a real emergency-access correction changes the fact-review proof. Actual service HTTP with isolated repositories; actual rework/resubmit acceptance and PostgreSQL evidence remain separate. Date of Creation: 17 October 2026.

| Test Case ID | Scenario / AC | Preconditions | Steps | Expected result | Layer | Date of Creation |
|---|---|---|---|---|---|---|
| TC-CS93-47 | Required Equipment proof: stock remains read-only across hydration | Technical Support page server-rendered with stock16/version14 | Render before mounting, then mount and open Manage equipment stock | No editable stock-total or Save stock control exists before or after hydration; the operational-unavailability form remains available after mounting | Actual Vue SSR and mounted page; updated for the current read-only stock UI, with versioned inventory API coverage retained in CS-41 | 2026-10-17T12:53:09+08:00 |
