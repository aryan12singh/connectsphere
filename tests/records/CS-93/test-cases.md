# CS-93 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS93-30 covers current coordinator preparation factors. Preconditions and steps: Real approved venue and existing summary; open Safety factor details. Expected result: Actual per-room80/120 shown; unknown factors labelled; unverified Technical/Safety submission stays disabled. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-93](https://spmg8.atlassian.net/browse/CS-93), current Jira criteria and preserved PM source cases below. These specifications do not establish test execution. Source endpoints, lifecycle names and policy examples remain subject to CS-76/77; no mock represents a delivered role, API, reservation, notice or Safety transition.

## Acceptance criteria

1. After all required current venue bookings and technical/support arrangements are approved/reserved or explicitly not required, the current assigned Coordinator can submit a safety review and the event reflects the pending stage.
2. Until then, the action is disabled and the outstanding arrangements are listed.
3. The event appears in the Safety Officer queue with expected attendance, each venue's capacity and layout, accessibility requirements, equipment list and known venue restrictions.
4. Pending-review arrangements cannot bypass controlled change handling. A legitimate change invalidates or supersedes the pending snapshot according to the agreed lifecycle; routine unrelated edits follow CS-43.
5. Safety Officers are notified when an event enters the queue.
6. Preparation is blocked until a current safety approval exists. The draft also blocks Confirmed until safety approval; that additional lifecycle ordering remains a Q1 working assumption.

## Preserved source cases

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

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-93?focusedCommentId=10121). These source cases remain Not Executed. Lifecycle, endpoint and privacy examples require CS-76/77 decisions; independent component assertions do not execute these cross-service cases.

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
