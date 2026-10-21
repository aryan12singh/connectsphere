# CS-95 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-13T20:47:00+08:00.

Source: [CS-95](https://spmg8.atlassian.net/browse/CS-95), reconciled with the [Session 3 customer answers](../../../docs/session3-decisions.md), rows2–3/17/45–51, on 14 October 2026. The current acceptance criteria below supersede contradictory historical examples. CS-77 still owns the reviewed API/state mapping; no mock represents a delivered role, API, reservation, notice or Safety transition. These specifications do not establish execution or acceptance.

## Acceptance criteria

1. On Request Changes, keep the event in Planning with the Safety issue and affected venue/technical/event-detail areas visible. The Coordinator reviews the decision and records the next action; exact stored states follow the reviewed CS-77 contract.
2. Do not automatically reset any venue or equipment sign-off, including affected areas. The Coordinator decides which arrangements require changes or a new approval. Unrelated commitments/approvals remain; stale evidence must not be represented as current readiness.
3. The Coordinator sees the permitted Safety feedback and affected items, and relevant Venue Staff/Technical Support Staff receive the required notice. The Organiser sees the outcome and actionable comments/next action, but not private internal notes or staff-only review details. The server enforces that separation.
4. After recorded Coordinator review of the current round/requirements revision and any directed rework, the current assigned Coordinator can resubmit only with complete current required-venue and technical/support readiness proof, or explicit technical `NOT_REQUIRED`. A new review round is created; previous rounds/decisions remain immutable. Reapproval is required only where the reviewed change process calls for it, not as an automatic response to every Safety decision.
5. Safety rejection targets the unsuitable venue arrangement(s), leaves the event in Planning with its issue/reason visible, and allows revised arrangements followed by another review. It does not reject/cancel the entire event or flag every unrelated arrangement. The Coordinator may separately reject/cancel the event through the normal event decision process.
6. A new valid review round must approve the corrected current arrangements before Confirmed and the separate Preparation stage. Staff preparation updates remain blocked until the event enters Preparation with current safety approval and complete required-arrangement readiness.
7. A significant accepted change follows Coordinator review and the standard event lifecycle, returning work to Planning/review as required and invalidating affected Safety evidence while retaining audit history. No sign-off is automatically reset; resubmission cannot reuse an approval for an older arrangement version.

## Preserved source cases — historical snapshot

The raw rows below retain their original examples byte-for-byte. They are historical source proposals, not current policy or execution results. TC-CS95-01/06/07's automatic reopening or blanket rejection flags are superseded by recorded Coordinator-directed action and scoped venue rejection. New execution follows the current criteria and [Safety integration boundary](../../../docs/safety-ui.md); no historical row is a current approval-reset requirement.

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

Source: [7 October PM reconciliation](https://spmg8.atlassian.net/browse/CS-95?focusedCommentId=10123). These unchanged historical source cases remain Not Executed. Their old provisional policy labels are superseded by the current criteria above; exact API/state mapping still requires CS-77. Independent component assertions do not execute these cross-service cases.

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

### TC-CS95-40 — Current Event-detail correction and rework
Date of Creation: 2026-10-17T03:22:00Z
Preconditions: authenticated real database-backed stack with an approved required venue and a decided Safety round.
Steps: record Coordinator review; correct source Event description/support needs; inspect old proof; submit/review new technical version; record current review; submit and approve next Safety round.
Expected: correction persists with history, old technical proof cannot authorize submission, fresh current proof and Coordinator review permit a new immutable round, and confirmation/Preparation remain gated.

### TC-CS95-42 — Reject the arrangement and require revised evidence
Date of Creation: 2026-10-17T03:41:00Z
Steps: Officer rejects one identified approved room; Coordinator records review; attempt unchanged resubmission; Venue Staff record corrected facts; Coordinator reviews current proof; resubmit and approve.
Expected: unchanged rejected evidence cannot create a new round, the booking and unrelated approvals remain attached, and a corrected current room proof permits a new immutable round.


## Integrated acceptance additions — 2026-10-17T03:53:21+00:00

These cases supplement the preserved earlier specifications. Current contracts and the Session 3/PO precedence remain authoritative. Browser IDs can cover several linked story assertions; matching numeric suffixes in the shared sheet do not imply identical scenarios.

| Test Case ID | Requirement / expected result | Execution layer and precondition |
|---|---|---|
| TC-CS95-40 | Recorded Coordinator source correction invalidates old technical proof; revised support approval and fresh review allow a new Safety round. | Actual authenticated Kong + source-owned PG/resource boundaries. |
| TC-CS95-41 | Current Coordinator sees feedback, records next action and factual rework, resubmits round2, confirms, separately starts Preparation; Venue Staff records a booking/round-scoped note. | Production desktop/mobile UI plus actual immutable snapshot and preparation PG records. |
| TC-CS95-42 | A specifically rejected venue cannot resubmit unchanged after review; actual Staff fact correction and fresh Coordinator review permit a new immutable round. | Actual authenticated Kong/PG/resource boundaries. |
| TC-CS95-43 | Metadata/version/name changes, same-room recreation, a hidden unchanged same-venue session, partial multi-room correction and set ordering cannot bypass scoped rejection. | Actual Event view module with isolated source/resource adapters. Eight positive/negative controls, no live acceptance claim. |

CI regression review, 2026-10-21: the TC-CS95-41 setup uses the Coordinator's explicit `NOT_REQUIRED` declaration directly; a second Support decision is not part of that contract. TC-CS95-40 retains its stale-revision assertion after a factual planning correction. Equipment service regressions additionally verify complete reservation evidence, exact-token fencing, acknowledgement before technical/supply edits, and a waiting edit's visibility of newly prepared proof in PostgreSQL.
