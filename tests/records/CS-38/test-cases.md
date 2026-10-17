# CS-38 — Test Case Specification (IS212 / IEEE 829)

## Q2 confirmation policy — 17 October 2026

Source: PO/team reply relayed by Aryan, followed by explicit confirmation that
no additional Coordinator venue-confirmation button is needed. The existing
TC-CS38-01 now checks tentative versus approved readiness and cleared policy
metadata. TC-CS38-30 additionally shows the Coordinator's tentative and approved
room, no confirmation control on either room card, exactly the request/Staff
decision activity, actual approval-notification delivery, and the unchanged
Planning Event in PostgreSQL. Its earlier execution records remain historical.

| Test Case ID | Scenario | Pre-conditions | Steps | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-23 | Q2: two-action venue confirmation | Assigned Coordinator, available suitable venue and active Planning Event | Create a hold as Coordinator; approve its read version as Staff; inspect saved row, activity, outbox and summary | TENTATIVELY_HELD v1 → CONFIRMED v2, deadline cleared, Coordinator creation + Staff decision only, one approval intent, no pending Q2 metadata; parent Event remains Planning | Actual Booking HTTP/PostgreSQL; upstream assignment/venue fixtures explicit | 2026-10-17 |

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS38-30 covers staff reason, authorization and stale decision. Preconditions and steps: Coordinator attempts approval; Staff uses actual queue/reason; replay old version. Expected result: 403 for Coordinator, disabled reasonless control, approved once, stale409 preserves approval. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-38](https://spmg8.atlassian.net/browse/CS-38), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment, reconciled 17 October 2026: requests use the distinct Planning Event ID; the Coordinator creates `TENTATIVELY_HELD` and a separate Venue Staff approval changes only that booking to `CONFIRMED`. No additional Coordinator venue-confirmation action is required (resolved Q2, CS-76). Validation uses422 `error.fields`; decisions/extensions carry the read version and a reason. Team policies 3–6 and Q1 are recorded in the [policy register](../../../docs/venue-policy-decisions.md). Original source tables/creation dates below are preserved; the live versioned decision endpoint supersedes their illustrative APPROVED/POST aliases.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-01 | Approve a pending request (AR AC1; AR-01 (New W7)) | B1 PENDING (E1, C1) | 1) POST /venue-bookings/B1/approve as VS1; — | APPROVED; 09:30–12:45 CONFIRMED; C1 notified; A1 assertEqual(db.booking("B1").status, "APPROVED") A2 assertEqual(status_at("V1",("09:30","12:45")), "CONFIRMED") A3 assertTrue(notify.sent(to="C1", type="BOOKING_APPROVED")) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-02 | Reject with reason (AR AC3; AR-02) | B1 PENDING | 1) POST reject as VS1; reason "Renovation" | REJECTED; hold released; reason visible to C1; A1 assertEqual(db.booking("B1").status, "REJECTED") A2 assertEqual(db.hold_for("B1").status, "RELEASED") A3 assertEqual(api(C1).get("/venue-bookings/B1").json()["reason"], "Renovation") | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-03 | Reject needs a reason (AR AC2; AR-03) | VS1 on B1 | 1) Click Reject 2) Leave reason blank; — | Submit disabled; A1 assertTrue(page.get_by_role("button", name="Submit").is_disabled()) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS38-04 | Tech Support approves (AR AC4; AR-04) | B1 PENDING | 1) POST approve as T1; — | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-05 | Re-decide an approved request (AR AC5; AR-05) | B1 APPROVED | 1) POST approve again; — | 409; status shown; A1 assertEqual(res.status_code, 409) A2 assertEqual(res.json()["status"], "APPROVED") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-06 | Expired hold (AR AC6 (+W7); AR-06 (New W7)) | H1 expired | 1) POST approve B1; — | 409 HOLD_EXPIRED; A1 assertEqual(res.json()["code"], "HOLD_EXPIRED") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-07 | Approve one of three (AR AC7 (+W7); AR-07 (New W7)) | E1 with B_a, B_b, B_c PENDING | 1) Approve B_a; — | B_a APPROVED; others PENDING; A1 assertEqual(db.booking("B_a").status, "APPROVED") A2 assertEqual(db.booking("B_b").status, "PENDING_VENUE_REVIEW") | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS38-08 | Approval around expiry T (AR AC6 (+W7); AR-08 (New W7)) | 3 fixtures | 1) Approve at T − 1 min, T, T + 1 min; — | 200, 409, 409; A1 assertEqual(at(T - m(1)).status_code, 200) A2 assertEqual(at(T).status_code, 409) A3 assertEqual(at(T + m(1)).status_code, 409) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-09 | Concurrent PostgreSQL decisions | Persisted active hold, two Staff decisions with same version | Approve and reject concurrently | One200 and one409; one immutable decision activity and intent | Real HTTP / PostgreSQL | 2026-10-12T19:13:47+08:00 |
| TC-CS38-10 | Coordinator cannot decide | Active hold and ordinary Coordinator | Call Staff decision endpoint | 403 without status/history/intent change | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS38-11 | Requirements changed while pending | Active hold; current parent requirements changed | Approve with previously valid booking version | 409 REQUIREMENTS_CHANGED; no approval write | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |

| Test Case ID | Derived regression | Pre-conditions | Steps | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-12 | Staff queue hydration safety | Active hold and authorized Staff queue in server-rendered HTML | Read before client handlers attach; mount normally and enter a reason | Search/reason/deadline/action controls disabled before hydration; mounted reason and decisions remain usable | Vue SSR/component; CS-87 also actual production browser | 2026-10-12T14:37:16+00:00 |

## 13 October 2026 continuation cases

Date of Creation: 2026-10-13T17:31:06+08:00. Original source IDs and assertions above are preserved. Results below require their named layer; component/intent proof does not establish inbox delivery or human acceptance.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-13 | AC2/6: expiry while the Staff queue remains open | Active rendered hold ending at the next controlled clock tick | Enter decision reason, advance through deadline and attempt approval | Decision/extension controls disable; no decision or extension request | Nuxt component with controlled clock | 2026-10-13T17:31:06+08:00 |
| TC-CS38-14 | AC1/6: expiry during pending queue lookup | Hold active at admission; delayed current venue lookup crosses expiry | GET pending queue through the real handler | Expired hold omitted; total0; persisted row/history unchanged | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |

## 13 October independent-audit regression cases

The cases below preserve current scope and original source assertions. Date of Creation: 2026-10-13T18:49:21+08:00.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-15 | AC3/6: orphan hold isolation | Valid request plus imported hold whose Event is missing | Read pending queue, attempt orphan rejection | Healthy requests readable; orphan visible with EVENT_NOT_FOUND, no invented Coordinator; mutation fails closed with unchanged history | Real HTTP boundary | 2026-10-13T18:49:21+08:00 |
| TC-CS38-16 | AC3/6: orphan hold controls | Imported pending row with EVENT_NOT_FOUND | Mount Staff queue | Decision reason/approve/reject disabled; no extension action | Nuxt component | 2026-10-13T18:49:21+08:00 |

## 13 October audit follow-up cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS38-17 | AC3/6: null Event link | Healthy pending request plus imported active hold with eventId null | Read Staff pending queue | Null link flagged EVENT_NOT_FOUND with no invented Coordinator; healthy request unchanged | 2026-10-13T18:56:24+08:00 |
| TC-CS38-18 | AC1/3/6: queue and decision race | Real migrated booking_test, read queued behind current Staff decision under controlled advisory lock | Approve first; read pending queue after lock is released | Current CONFIRMED record omitted from tentative queue; exactly one decision history | 2026-10-13T18:56:24+08:00 |

## 13 October read projection race cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS38-19 | AC3/6: current venue after queue wait | PostgreSQL queue at A waits behind a supported room move to B | Move wins lock; Staff reads A tentative queue | Moved booking omitted; all original filters reapply to current rows | 2026-10-13T19:07:55+08:00 |

TC-CS38-18: Staff sees the Coordinator request and approves its exact deadline with a reason; no free-form unrequested extension control. Team policy agreed 14 October 2026.


## Decision reason boundary — 17 October 2026, 03:54 UTC

TC-CS38-20: use the PM sheet's proposed 500-character decision-reason limit as an engineering default. Whitespace and 501 trimmed characters return422 without booking/history/version changes; 1 and500 pass. This is an internal validation decision, not a new customer answer. Actual HTTP handler evidence is separate from real PG and browser acceptance.


## 17 October shared-Sheet evidence reconciliation

Existing customer intent is preserved. Logical draft fields/statuses are reconciled with the operative contract; examples do not create a second reservation or acceptance claim. Date of Creation: 2026-10-17T12:24:00+08:00.

| Test Case ID | Scenario / AC | Preconditions | Steps | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS38-21 | Decision AC: Venue Staff authorization | One current active hold | Attempt decision as Organiser, Coordinator and Attendee | 403; held status/version unchanged | Actual service HTTP with isolated repository fixtures | 2026-10-17T12:24:00+08:00 |
| TC-CS38-22 | Decision AC: terminal rejection | Reject a hold at version1 | Approve rejected request with its fresh version2 | 409; remains REJECTED/version2 without reopening a hold | Actual service HTTP with isolated repository fixtures | 2026-10-17T12:24:00+08:00 |
