# CS-84 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS84-30 covers audited staff buffer form. Preconditions and steps: Save30/45 through real form with reason; inspect actual Venue row. Expected result: Version2, matching hours retained, actual buffers persisted. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-84](https://spmg8.atlassian.net/browse/CS-84), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS84-01 | Venue Staff set setup and turnaround (AC1) | seed_base; V2 at 0/0 | PUT /venues/V2 as VS1; setupMin 30, turnaroundMin 45 | 200; values stored; A1 assertEqual(res.status_code, 200) A2 assertEqual(db.venue("V2").setup_min, 30) A3 assertEqual(db.venue("V2").turnaround_min, 45) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-02 | Coordinator sees the updated setup time (AC4) | seed_base; VS1 and C1 browsers | VS1 edits V2 setup to 60, saves 2) C1 opens V2 from search results; setup 60 | C1 sees "Setup 60 min"; A1 assertEqual(page_c1.locator("#v2 .setup").inner_text(), "60 min") | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS84-03 | Coordinator cannot change buffers (AC4) | seed_base | PUT /venues/V2 as C1; setupMin 10 | 403; unchanged; A1 assertEqual(res.status_code, 403) A2 assertEqual(db.venue("V2").setup_min, 0) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-04 | Non-integer values rejected (invalid equivalence classes) (AC2, AC3) | seed_base | PUT setupMin "abc" 2) PUT setupMin 15.5; "abc"; 15.5 | 400 with setupMin flagged each time; A1 assertEqual(r1.status_code, 400) A2 assertIn("setupMin", r1.json()["fieldErrors"]) A3 assertEqual(r2.status_code, 400) A4 assertEqual(db.venue("V2").setup_min, 0) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-05 | Venues created before the change default to 0 (AC2) | migration applied to V_old | GET /venues/V_old as VS1; — | setup 0, turnaround 0; A1 assertEqual(res.json()["setupMin"], 0) A2 assertEqual(res.json()["turnaroundMin"], 0) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-06 | Lower and upper limits (placeholder max 480) (AC2) | seed_base | PUT setupMin for each value; −1, 0, 480, 481 | 400, 200, 200, 400; A1 assertEqual(put(-1).status_code, 400) A2 assertEqual(put(0).status_code, 200) A3 assertEqual(put(480).status_code, 200) A4 assertEqual(put(481).status_code, 400) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-07 | Create a venue with buffers (CS-33 AC1 (+W7); 33-01 (Updated)) | seed_base | 1) POST /venues as VS1; Hall A, location L1, capacity 300, layouts [THEATRE], setup 30, turnaround 45 | 201; all fields stored; A1 assertEqual(res.status_code, 201) A2 assertEqual(v.capacity, 300) A3 assertEqual((v.setup_min, v.turnaround_min), (30, 45)) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-08 | Edit visible to others immediately (CS-33 AC5; 33-02) | VS1 and C1 browsers | 1) VS1 sets V1 capacity 350, saves 2) C1 refreshes venue list; 350 | C1 sees 350; A1 assertEqual(page_c1.inner_text("#V1 .capacity"), "350") | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS84-09 | Coordinator edits a venue (CS-33 AC3; 33-03) | seed_base | 1) PUT /venues/V1 as C1; capacity 10 | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-10 | Non-numeric capacity (CS-33 AC2; 33-04) | seed_base | 1) PUT /venues/V1 as VS1; capacity "abc" | 400 capacity flagged; A1 assertEqual(res.status_code, 400) A2 assertIn("capacity", res.json()["fieldErrors"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-11 | Delete a venue in use (CS-33 AC4; 33-05) | V1 has bookings | 1) DELETE /venues/V1 as VS1; — | 409; suggestion DEACTIVATE; A1 assertEqual(res.status_code, 409) A2 assertEqual(res.json()["suggestion"], "DEACTIVATE") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-12 | Capacity limits (placeholder max 10,000) (CS-33 AC2; 33-06) | seed_base | 1) PUT capacity for each value; 0, 1, 10000, 10001 | 400, 200, 200, 400; A1 assertEqual(put(0).status_code, 400) A2 assertEqual(put(1).status_code, 200) A3 assertEqual(put(10000).status_code, 200) A4 assertEqual(put(10001).status_code, 400) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-13 | Buffers default to 0 (CS-33 AC1 (+W7); 33-07 (New)) | seed_base | 1) POST /venues without buffer fields; Hall B, L1, 100 | Both 0; A1 assertEqual(v.setup_min, 0) A2 assertEqual(v.turnaround_min, 0) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-14 | Buffer change triggers re-check (CS-33 AC1 (+W7); 33-08 (New)) | V3 with bookings | 1) PUT /venues/V3 turnaround 15 → 45 as VS1; 45 | 200; BUFFER_RECHECK job queued for V3; A1 assertEqual(res.status_code, 200) A2 assertIn(("BUFFER_RECHECK","V3"), jobs.enqueued()) | Workflow · Integration | 2026-10-12T19:13:47+08:00 |

Source numeric placeholders (480 buffer minutes and 10,000 capacity) remain configurable working limits. TC-CS84-05 requires migration evidence; a new compatibility create is recorded separately under13. The isolated legacy migration probe preserved IDs, hours and history, but is not a replacement for every source rollout case.

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS84-15 | Durable configuration recheck retry | Venue versioned edit; Booking initially unavailable | Let actual worker retry | Persist pending intent across failure, stable action ID, acknowledge matching/current version | Real HTTP running worker / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS84-16 | Deletion and in-flight commitment | Booking creation holds Venue commit lock | Attempt deletion while commitment finishes | Deletion waits, then409; committed booking retains its venue | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS84-17 | Virtual form nullable capacity | Virtual venue with empty physical capacity field | Serialize form | capacity null under existing API contract; no false zero | Form-state unit | 2026-10-12T19:13:47+08:00 |

## 13 October final recovery and concurrency cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS84-18 | AC1/3/6: persistent removal fence | Real venue_test with current higher configuration version | Private DELETE with old/missing version | 409/422; catalogue, operating hours, immutable history and durable rechecks unchanged | 2026-10-13T19:02:26+08:00 |
