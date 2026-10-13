# CS-39 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS39-30 covers concurrent request winner. Preconditions and steps: Two simultaneous requests for one buffered slot through live BFF; inspect owned fixture rows. Expected result: One200 and one409; exactly one saved booking; Coordinator page and PostgreSQL proof. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-39](https://spmg8.atlassian.net/browse/CS-39), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS39-01 | Overlap flagged before decision (DO AC1; DO-01) | B1 APPROVED 10:00–12:00; B2 PENDING 11:00–13:00 at V1 | 1) GET /venue-bookings/B2 as VS1; — | conflicts contains B1; A1 assertIn("B1", [c["bookingId"] for c in res.json()["conflicts"]]) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-02 | Approved booking used in later checks (DO AC4; DO-02) | B3 approved; B4 overlaps B3 | 1) GET B4; — | conflicts contains B3; A1 assertIn("B3", conflict_ids("B4")) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-03 | Conflict is a hard block even after acknowledgement (DO AC2; DO-03) | DO-01 state; VS1 on B2 | Attempt approval of the conflicting new commitment, with and without an acknowledgement/override payload.; — | 409 conflict; neither acknowledgement nor override creates a new overlapping commitment; original booking remains.; Assert both attempts are rejected; assert no new effective commitment, history or success outbox; original arrangement unchanged. | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS39-04 | Search, calendar, approval agree (DO AC1 (+W7); DO-04 (New W7)) | B1 at V1 | 1) Search 12:30–13:30 2) Calendar at 12:40 3) GET new booking conflicts; — | All report conflict with B1; A1 assertNotIn("V1", search_ids) A2 assertEqual(status_at("V1","12:40"), "CONFIRMED") A3 assertListEqual(conflict_ids("B_new"), ["B1"]) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-05 | Clash only because of turnaround (DO AC1 (+W7); DO-05 (New W7)) | V45 (0/45): B1 10:00–12:00, B2 12:30–14:00 | 1) GET B2; — | Conflict with B1; A1 assertListEqual(conflict_ids("B2"), ["B1"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-06 | Only an expired hold overlaps (DO AC3 (+W7); DO-06 (New W7)) | H_exp expired; B5 over it | 1) GET B5; — | No conflicts; A1 assertListEqual(conflict_ids("B5"), []) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-07 | Conflict cannot be overridden through the API (DO AC2; DO-07) | DO-01 state | Attempt approval of the conflicting new commitment, with and without an acknowledgement/override payload.; — | 409 conflict; neither acknowledgement nor override creates a new overlapping commitment; original booking remains.; Assert both attempts are rejected; assert no new effective commitment, history or success outbox; original arrangement unchanged. | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-08 | Window ends 12:45; new starts 12:44, 12:45, 12:46 (DO AC3 (+W7); DO-08 (New W7)) | 3 fixtures | 1) GET conflicts for each; — | Flagged, not, not; A1 assertListEqual(conflict_ids(at("12:44")), ["B1"]) A2 assertListEqual(conflict_ids(at("12:45")), []) A3 assertListEqual(conflict_ids(at("12:46")), []) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS39-09 | Parallel occupied-window commitments | Two eligible requests for same Venue/time | Submit concurrently with distinct idempotency keys | One201/one409; one booking/activity/request intent | HTTP / memory and PostgreSQL | 2026-10-12T19:13:47+08:00 |
| TC-CS39-10 | Combined-role direct-confirmation bypass | Caller has Coordinator and Venue Staff roles | Create ordinary booking with CONFIRMED or conflict override | 403; no direct-confirmed record or overridden commitment | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS39-11 | Operational closure and explicit release | Existing independent holds | Staff closes an overlapping interval, then releases it | Flag affected records without cancelling them; release clears managed flags | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
