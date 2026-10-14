# CS-94 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-94](https://spmg8.atlassian.net/browse/CS-94), current Jira criteria and preserved PM source cases below. These specifications do not establish test execution. Source endpoints, lifecycle names and policy examples remain subject to CS-76/77; no mock represents a delivered role, API, reservation, notice or Safety transition.

## Acceptance criteria

1. The Safety Officer sees all Pending Safety Check events, soonest event date first.
2. The review page shows expected attendance against each venue's capacity, layout, emergency access, accessibility requirements, equipment placement, crowd movement notes and venue restrictions. Attendance above capacity is highlighted.
3. The Safety Officer records exactly one decision per review round: Approve, Reject or Request Changes. Reject and Request Changes require a reason, and Request Changes also requires the affected area(s): Venue, Equipment/Technical, or Event details.
4. Approve records a current safety approval, updates the agreed lifecycle/readiness state and informs the Coordinator.
5. Each versioned review-round decision records officer, time, outcome/reasons and remains immutable. Concurrent duplicate or stale decisions cannot approve superseded arrangements.
6. Only Safety Officers can record a safety decision. Other roles receive 403.
7. Preparation cannot proceed on a pending, rejected, changes-requested or outdated safety decision. Visibility follows Q15 and record/role authorization.

## Preserved source cases

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

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-94?focusedCommentId=10125). These source cases remain Not Executed. Lifecycle, endpoint and privacy examples require CS-76/77 decisions; independent component assertions do not execute these cross-service cases.

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
