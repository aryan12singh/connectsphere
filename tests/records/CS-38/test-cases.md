# CS-38 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-38](https://spmg8.atlassian.net/browse/CS-38), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

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
