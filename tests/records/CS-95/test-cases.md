# CS-95 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-95](https://spmg8.atlassian.net/browse/CS-95), current Jira criteria and preserved PM source cases below. These specifications do not establish test execution. Source endpoints, lifecycle names and policy examples remain subject to CS-76/77; no mock represents a delivered role, API, reservation, notice or Safety transition.

## Acceptance criteria

1. On Request Changes, return the event to the agreed earlier planning stage and reopen the affected venue/technical/event-detail areas. Exact status names and mappings follow Q1.
2. Arrangements in areas not selected keep their Approved status.
3. The Coordinator sees the Safety Officer's comments and the flagged items. The relevant Venue Staff and Technical Support Staff are notified.
4. Once the flagged arrangements are re-approved, the Coordinator can resubmit for a new safety review round. Earlier rounds and decisions stay in the history.
5. On safety rejection, preparation remains blocked. The draft returns to Planning with all arrangements flagged; final rework scope follows the recorded decision and does not automatically cancel the event.
6. A new valid review round must approve the corrected arrangements before preparation. The draft also requires this before Confirmed, pending Q1.
7. Significant changes invalidate affected safety evidence under Q14 while preserving audit history and unrelated commitments; resubmission cannot reuse an approval for an older arrangement version.

## Preserved source cases

| TC ID | Type · Level | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS95-01 | Happy path · Integration | AC1, AC2, AC3 | Changes requested on Venue only | fx_ready + PENDING_SAFETY_CHECK | S1 posts REQUEST_CHANGES [VENUE] | reason "Exit blocked" | E1 PLANNING; bookings PENDING_VENUE_REVIEW; equipment APPROVED; VS1 notified | A1 assertEqual(db.event("E1").status, "PLANNING") A2 assertEqual({b.status for b in db.bookings(event="E1")}, {"PENDING_VENUE_REVIEW"}) A3 assertEqual(db.equipment("E1").status, "APPROVED") A4 assertTrue(notify.sent(to="VS1", event="E1")) | A1 back to planning. A2 venue reopened. A3 unselected area untouched (catches reopen-everything). A4 staff told to re-review. | Not Executed |
| TC-CS95-02 | Happy path · Integration | AC4, AC6 | Round 2 approved after rework | TC-CS95-01 state | VS1 re-approves bookings 2) C1 resubmits 3) S1 approves R2 4) C1 confirms | — | R2 round 2 APPROVE; R1 kept; confirm 200 | A1 assertEqual(db.review("R2").round, 2) A2 assertIsNotNone(db.review("R1")) A3 assertEqual(confirm.status_code, 200) | A1 rounds counted. A2 history kept (catches overwrite of round 1). A3 gate opens only now. | Not Executed |
| TC-CS95-03 | Workflow · E2E | AC3 | Coordinator sees what to fix | TC-CS95-01 state; C1 logged in | Open E1 | — | Comment "Exit blocked"; B1 flagged; Resubmit disabled | A1 assertIn("Exit blocked", page.inner_text("#safety-comments")) A2 assertIn("B1", page.inner_text("#flagged")) A3 assertTrue(page.get_by_role("button", name="Resubmit for safety").is_disabled()) | A1/A2 clear guidance. A3 can't resubmit unfixed work. | Not Executed |
| TC-CS95-04 | Cross-cutting · Integration | AC4 | Only the assigned Coordinator resubmits | TC-CS95-01 state, fixed | POST /events/E1/safety-check as C2 | — | 403 | A1 assertEqual(res.status_code, 403) | A1 assignment rule holds in rework. | Not Executed |
| TC-CS95-05 | Negative · Integration | AC4 | Resubmit with item still pending | TC-CS95-01 state; B1 still pending | POST /events/E1/safety-check as C1 | — | 409; B1 outstanding | A1 assertEqual(res.status_code, 409) A2 assertIn("B1", res.json()["outstanding"]) | A1/A2 readiness re-checked on resubmit (catches bypass via round 2). | Not Executed |
| TC-CS95-06 | Negative · Integration | AC5 | Rejection returns to planning, not cancelled | fx_ready + PENDING_SAFETY_CHECK | S1 posts REJECT | reason "Crowd flow unsafe" | E1 PLANNING; all arrangements flagged | A1 assertEqual(db.event("E1").status, "PLANNING") A2 assertTrue(all("SAFETY_REVIEW" in b.flags for b in db.bookings(event="E1"))) A3 assertIn("SAFETY_REVIEW", db.equipment("E1").flags) | A1 not cancelled (assumption Q 6.1). A2/A3 everything reopened on reject (catches reject handled like changes). | Not Executed |
| TC-CS95-07 | Boundary · Integration | AC1 | 1 area vs all 3 areas | fx_ready (two fixtures) | REQUEST_CHANGES [VENUE] 2) REQUEST_CHANGES [VENUE, EQUIPMENT, EVENT_DETAILS] | areas lists | 1: only venue reopened; 3: all reopened | A1 assertSetEqual(reopened(fx1), {"VENUE"}) A2 assertSetEqual(reopened(fx3), {"VENUE","EQUIPMENT","EVENT_DETAILS"}) | A1 minimum selection honoured. A2 maximum selection honoured (catches only first area applied). | Not Executed |

## Preserved PM supplemental cases

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-95?focusedCommentId=10123). These source cases remain Not Executed. Lifecycle, endpoint and privacy examples require CS-76/77 decisions; independent component assertions do not execute these cross-service cases.

| Test Case ID | Type · Level | Source AC / original ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Assertions | Intent / reconciliation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS95-08 | Happy path · Integration | CS-44 AC1, AC2 (+W7); 44-08 (New) | Safety rounds logged | fx_ready | 1) S1 REQUEST_CHANGES (R1) 2) rework 3) S1 APPROVE (R2) 4) GET history as C1 | reason "Exit blocked" | 2 SAFETY_DECISION entries, rounds 2 then 1 | A1 assertListEqual(\[h.round for h in safety\], \[2, 1\]) A2 assertEqual(safety\[1\].reason, "Exit blocked") | A1 both rounds kept in order. A2 reason kept for the Coordinator. | Not Executed |

## Independent UI and validation cases

These added component cases deliberately cover only the available UI/validation slice. Original submission, officer authorization, durable decisions/rework/history and inbox cases remain Not Executed until the actual cross-service implementations exist. Component fixtures are explicit proposed display projections, not a new backend contract. Yellow execution records retain the layer and revision.

| Test Case ID | Scenario / AC | Preconditions and steps | Expected result |
| --- | --- | --- | --- |
| TC-CS95-20 | AC1/2: selective rework display | Venue affected; Technical and Event details unaffected | Only Venue shown needing rework; unaffected approvals remain |
| TC-CS95-21 | AC3: feedback visibility | Receive private Safety reasons without view permission | Private reason/round/affected areas not rendered |
| TC-CS95-22 | AC4: all affected areas ready before resubmit | Venue then Venue+Technical affected, with incomplete readiness | Resubmit disabled until every affected area has current explicit proof |
| TC-CS95-23 | AC4/6: stale proof and unknown area | Outdated readiness revision or unrecognised affected area | Resubmit disabled; no invented approval |
| TC-CS95-24 | AC4: current round intent and retained history | Visible current feedback, all affected areas explicitly ready; submit twice | One versioned next-round intent; old decision not mutated or reported as saved |
| TC-CS95-25 | AC3/4: missing feedback or malformed round | No review projection, or invalid review identifier | No private content for absent feedback; malformed proof never enables resubmission |
| TC-CS95-26 | AC4/6: stale readiness wording | Affected Venue ready flag with older proof revision | Readiness not verified, never rework approved; resubmit disabled |
| TC-CS95-27 | AC4: repeated same-error failure | Two identical failed resubmissions then a successful parent cycle | Each failure allows retry; success/duplicate clicks guarded; no false saved success |

## Session 3 requirements — 14 October 2026

Source: `docs/session3-decisions.md`, rows26/17/46/47/49/51. Earlier expected automatic reapproval wording is superseded by Coordinator-directed review; existing historical runs are preserved. Decision cases now require the complete reviewed checklist, and rejection identifies an affected venue arrangement. Execution results live in dated test-runs, not this specification.

| Test ID | Scenario | Preconditions | Steps | Expected result | Layer |
| --- | --- | --- | --- | --- | --- |
| TC-CS95-28 | Coordinator-directed rework | Current readiness without recorded Coordinator review | Try resubmit; provide matching review round/revision | Blocked without review; enabled only with current proof; no automatic approval-reset claim | Nuxt component |
| TC-CS95-29 | Organiser feedback privacy | Feedback includes internal notes and arrangements | Render Organiser audience | Only outcome and actionable reason; no private notes/internal arrangements/actions | Nuxt component |
