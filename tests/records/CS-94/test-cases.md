# CS-94 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-94](https://spmg8.atlassian.net/browse/CS-94), reconciled with the [Session 3 customer answers](../../../docs/session3-decisions.md), rows2–3/17/45–51, on 14 October 2026. The current acceptance criteria below supersede contradictory historical examples. CS-77 still owns the reviewed API/state mapping; no mock represents a delivered role, API, reservation, notice or Safety transition. These specifications do not establish execution or acceptance.

## Acceptance criteria

1. An authorized Safety Officer sees permitted Pending Safety Check reviews through the review queue/assignment, soonest event date first, with relevant arrangement/change history. This does not grant unrestricted access to unrelated event information.
2. The review page shows expected attendance against each venue's capacity, layout, emergency access, accessibility requirements, equipment placement, crowd movement notes and venue restrictions. Attendance above capacity is highlighted.
3. The Safety Officer reviews all seven factors and records exactly one decision per current review round: Approve, Reject the venue arrangement, or Request Changes. Rejection identifies the affected venue booking(s); Reject and Request Changes require actionable reasons, and Request Changes also requires the affected area(s): Venue, Equipment/Technical, or Event details. The reviewed checklist does not assert that every factor is safe regardless of the chosen outcome.
4. Approve records a current safety approval, updates the reviewed lifecycle/readiness state and informs the Coordinator. Safety approval precedes Confirmed; Preparation is a separate later stage. Reject/Request Changes leaves the event in Planning for Coordinator-directed action and does not automatically reset venue/equipment approvals or reject/cancel the entire event.
5. Each versioned review-round decision records officer, time, reviewed checklist, outcome, affected arrangements/areas, shared actionable comments and separate private internal notes, and remains immutable. Concurrent duplicate or stale decisions cannot approve superseded arrangements.
6. Only Safety Officers can record a safety decision. Other roles receive 403.
7. Confirmation and preparation cannot bypass a pending, rejected, changes-requested or outdated safety decision. Staff preparation updates require the event to enter Preparation with current safety approval and complete required-arrangement readiness.
8. The Organiser sees the outcome and actionable comments, including the next action, but never private internal notes. The server enforces role/record authorization and redacts private content before returning the response; component hiding is not the privacy boundary.

## Preserved source cases — historical snapshot

The raw rows below retain their original examples byte-for-byte. They are historical source proposals, not current policy or execution results. TC-CS94-08's blanket suppression of reasons is superseded: Organisers receive actionable comments while private internal notes remain hidden. Current criteria and the [Safety integration boundary](../../../docs/safety-ui.md) govern new execution.

| TC ID | Type · Level | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS94-01 | Happy path · Integration | AC4, AC5 | Safety Officer approves | E1 PENDING_SAFETY_CHECK, review R1 | POST /safety-reviews/R1/decision as S1 | decision APPROVE | E1 SAFETY_APPROVED; R1 stores S1 and time; C1 notified | A1 assertEqual(db.event("E1").status, "SAFETY_APPROVED") A2 assertEqual(r.officer_id, "S1") A3 assertEqual(r.decided_at, clock.now()) A4 assertTrue(notify.sent(to="C1", type="SAFETY_APPROVED")) | A1 gate opens. A2/A3 decision attributable (auditability). A4 Coordinator told. | Not Executed |
| TC-CS94-02 | Happy path · Integration | AC3 | Request changes on Venue | as TC-CS94-01 | POST decision as S1 | REQUEST_CHANGES, reason "Exit blocked", areas [VENUE] | SAFETY_CHANGES_REQUESTED; areas stored | A1 assertEqual(db.event("E1").status, "SAFETY_CHANGES_REQUESTED") A2 assertListEqual(db.review("R1").areas, ["VENUE"]) | A1 right status. A2 area kept for CS-95 rework (catches areas dropped). | Not Executed |
| TC-CS94-03 | Workflow · E2E | AC3 | Area must be ticked | as TC-CS94-01; S1 logged in | Open R1 2) Select Request Changes 3) Type reason, tick nothing | reason "Exit blocked" | Submit disabled | A1 assertTrue(page.get_by_role("button", name="Submit").is_disabled()) | A1 UI enforces area selection (catches vague requests). | Not Executed |
| TC-CS94-04 | Cross-cutting · Integration | AC6 | Coordinator can't record a safety decision | as TC-CS94-01 | POST decision as C1 | APPROVE | 403; no decision | A1 assertEqual(res.status_code, 403) A2 assertIsNone(db.review("R1").decision) | A1 separation of duties (catches Coordinator self-approving). A2 no write. | Not Executed |
| TC-CS94-05 | Negative · Integration | AC3 | Reject needs a reason | as TC-CS94-01 | POST decision as S1 | REJECT, no reason | 400 reason flagged | A1 assertEqual(res.status_code, 400) A2 assertIn("reason", res.json()["fieldErrors"]) | A1/A2 Coordinator always gets an explanation. | Not Executed |
| TC-CS94-06 | Negative · Integration | AC5 | Decisions are immutable | R1 decided APPROVE | PUT /safety-reviews/R1 as S1 | decision REJECT | 405/409; still APPROVE | A1 assertIn(res.status_code, (405, 409)) A2 assertEqual(db.review("R1").decision, "APPROVE") | A1/A2 audit trail can't be rewritten. | Not Executed |
| TC-CS94-07 | Boundary · Integration | AC2 | Over-capacity highlight (capacity 300) | 3 events at V1 with attendance 299, 300, 301 | GET each review as S1 | 299, 300, 301 | overCapacity false, false, true | A1 assertFalse(rv(299)["overCapacity"]) A2 assertFalse(rv(300)["overCapacity"]) A3 assertTrue(rv(301)["overCapacity"]) | A1 below: fine. A2 at capacity: fine (catches >= instead of >). A3 above: flagged. | Not Executed |

## Preserved PM supplemental cases

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-94?focusedCommentId=10125). These unchanged historical source cases remain Not Executed. Their old provisional policy labels are superseded by the current criteria above; exact API/state mapping still requires CS-77. Independent component assertions do not execute these cross-service cases.

| Test Case ID | Type · Level | Source AC / original ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent / reconciliation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS94-08 | Cross-cutting · Integration | CS-44 AC3 (+W7); 44-10 (New) | Organiser sees safety status, not reasons | 44-08 state | 1) GET history as O1 | — | Safety entries without reason text | A1 assertTrue(len(safety_o1) > 0) A2 assertTrue(all(h.get("reason") is None for h in safety_o1)) | A1 status change visible. A2 internal notes hidden (assumption Q 6.4). Internal Safety-reason visibility remains pending Q15. | Not Executed |

## Independent UI and validation cases

These added component cases deliberately cover only the available UI/validation slice. Original submission, officer authorization, durable decisions/rework/history and inbox cases remain Not Executed until the actual cross-service implementations exist. Component fixtures are explicit proposed display projections, not a new backend contract. Yellow execution records retain the layer and revision.

| Test Case ID | Scenario / AC | Preconditions and steps | Expected result |
| --- | --- | --- | --- |
| TC-CS94-20 | AC2: seven-factor, per-venue presentation | Two rooms with independent attendance/capacity; unknown equipment/restrictions | Every factor visible; only over-capacity room highlighted; no summed capacity or inferred equipment approval |
| TC-CS94-21 | AC3: Reject requires a reason | Verified current form; select Reject and submit whitespace reason | Required reason error; no decision intent |
| TC-CS94-22 | AC3: Request Changes requires reason and areas | Submit with no reason, then with reason but no area | Field errors; no intent; valid selected areas emitted once |
| TC-CS94-23 | AC3/4: Approve and trim optional explanation | Verified current form; choose Approve | One versioned decision intent; no stale affected areas |
| TC-CS94-24 | AC5/6: fail-closed form permissions/versions | Default disabled, revoked permission, invalid/stale round or changed requirements revision | No decision intent; appropriate disabled controls |
| TC-CS94-25 | AC5: review-round change clears the old draft | Fill reason/area, then replace round | Old reason/area removed; new valid round used |
| TC-CS94-26 | AC3: unknown choices rejected and repeated submission guarded | Tamper form selection/areas; submit valid decision twice | Unknown data refused; one intent; no false persisted success |
| TC-CS94-27 | AC3/5: malformed decision data | Validate a non-string value whose conversion resembles Approve | Refused, never emitted as a valid decision |
| TC-CS94-28 | AC5: unavailable current round | Null/loading round or invalid round identifier | UI remains usable and disabled; no crash or decision intent |
| TC-CS94-29 | AC3/5: repeated same-error failure | Emit valid intent; two pending→failed cycles with identical error; then a successful parent cycle | Retry works after each failure; duplicate clicks/success remain guarded; reason retained |

## Session 3 requirements — 14 October 2026

Source: `docs/session3-decisions.md`, rows26/17/46/47/49/51. Earlier expected automatic reapproval wording is superseded by Coordinator-directed review; existing historical runs are preserved. Decision cases now require the complete reviewed checklist, and rejection identifies an affected venue arrangement. Execution results live in dated test-runs, not this specification.

| Test ID | Scenario | Preconditions | Steps | Expected result | Layer |
| --- | --- | --- | --- | --- | --- |
| TC-CS94-30 | Structured Safety decision | Permitted current round and known rooms | Try approval without checklist; review seven factors; add public and private comments | No intent until all factors reviewed; separate trimmed comments and current round | Nuxt component |

| TC-CS94-41 | Source operational Safety facts | Venue Staff save emergency access, crowd-movement notes and restrictions through the actual Venue API | Fields persist and are supplied separately from general Event requirements | Real HTTP / isolated repositories; production PG acceptance follows | 2026-10-17T11:05:00+08:00 |

### TC-CS94-42 — Complete decision intent before an enabled submit control
Date of Creation: 2026-10-17T03:38:00Z
Steps: complete seven review factors, select Request Changes and enter a reason; then select an affected area.
Expected: the actual decision button is disabled until the reason and area are complete; backend validation remains authoritative.


## Integrated acceptance additions — 2026-10-17T03:53:21+00:00

These cases supplement the preserved earlier specifications. Current contracts and the Session 3/PO precedence remain authoritative. Browser IDs can cover several linked story assertions; matching numeric suffixes in the shared sheet do not imply identical scenarios.

| Test Case ID | Requirement / expected result | Execution layer and precondition |
|---|---|---|
| TC-CS94-43 | Officer UI requires seven checked factors, an actionable comment and an affected area before saving changes; round2 approval/history persists. | Production desktop/mobile browser + real role authentication, Event database and immutable history. |
