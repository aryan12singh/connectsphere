# CS-36 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS36-30 covers full/partial suitability and empty search. Preconditions and steps: Current Coordinator searches unique catalogue names; full venue has required projector; partial lacks it. Expected result: Full match first, explicit missing facility, partial request disabled, empty state visible. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-36](https://spmg8.atlassian.net/browse/CS-36), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS36-01 | Basic search (SV AC1; SV-01) | seed_base + fx_venues (V1 300, V2 150, V_small 80) | 1) GET /venues/search as C1; D, 10:00–12:00, attendance 120 | V1, V2 returned; V_small not; A1 assertSetEqual(set(ids), {"V1","V2"}) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-02 | Facility needs marked, not hidden (SV AC2; SV-02) | fx_venues; V2 lacks projector | 1) Search with needs; needs WHEELCHAIR, PROJECTOR | V2 listed with missing [PROJECTOR]; A1 assertIn("V2", ids) A2 assertListEqual(r("V2")["missing"], ["PROJECTOR"]) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-03 | Nothing fully fits (SV AC5; SV-03) | fx_venues | 1) Search; attendance 1000 | Closest venues with CAPACITY unmet; A1 assertGreater(len(results), 0) A2 assertTrue(all("CAPACITY" in v["missing"] for v in results)) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-04 | Find venue from an event (SV AC1 (+W7); SV-04 (New W7)) | E1 APPROVED; C1 logged in | 1) Open E1 2) Click Find venue; — | Pre-filled; each result shows occupied window; A1 assertEqual(page.input_value("#attendance"), "200") A2 assertEqual(page.get_attribute("#V1","data-occupied"), "09:30-12:45") | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS36-05 | Add another space (SV AC6 (+W7); SV-05 (New W7)) | E1 has B1; C1 logged in | 1) Click Add another venue; — | Existing booking listed; A1 assertEqual(page.locator(".existing-booking").count(), 1) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS36-06 | Organiser searches (SV AC1; SV-06) | seed_base | 1) GET /venues/search as O1; — | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-07 | Date missing (SV AC4; SV-07) | seed_base | 1) Search without date; 10:00–12:00, 100 | 400 date flagged; A1 assertEqual(res.status_code, 400) A2 assertIn("date", res.json()["fieldErrors"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-08 | Turnaround of a confirmed booking excludes V1 (SV AC3 (+W7); SV-08 (New W7)) | B1 10:00–12:00 APPROVED at V1 | 1) Search 13:00–14:00; — | V1 not returned; A1 assertNotIn("V1", ids) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-09 | Expired hold doesn't exclude (SV AC3 (+W7); SV-09 (New W7)) | Expired H_x at V2 over slot | 1) Search slot; — | V2 returned; A1 assertIn("V2", ids) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-10 | Attendance vs capacity 300 (SV AC1; SV-10) | fx_venues | 1) Search with each attendance; 299, 300, 301 | V1 meets all for 299, 300; CAPACITY missing at 301; A1 assertEqual(r299("V1")["missing"], []) A2 assertEqual(r300("V1")["missing"], []) A3 assertIn("CAPACITY", r301("V1")["missing"]) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS36-11 | Window touching vs overlapping (SV AC3 (+W7); SV-11 (New W7)) | V0x (0/0) with booking ending 12:45 | 1) Search from 12:44, 12:45, 12:46; 3 start times | Excluded, included, included; A1 assertNotIn("V0x", ids_1244) A2 assertIn("V0x", ids_1245) A3 assertIn("V0x", ids_1246) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |

Source discrepancy: TC-CS36-03/10 propose returning under-capacity fallback candidates. The live card permits partial matches only when capacity/occupied availability fit and requires a clear no-results state. Preserve both source expectations for PO reconciliation; do not claim those original fallback cases Pass from the current hard-capacity guard.

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS36-12 | Combined suitability and occupancy filters | Current assigned Coordinator; active and inactive, small, full, partial and occupied rooms | Search a buffered interval without requesting | Return eligible full matches before partials; exclude hard capacity, inactive and occupied candidates; save no hold | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-13 | Current assignment controls search | Existing Planning Event assigned to another Coordinator | Search its arrangements | 403; no mutation | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-14 | Customer booking privacy in a shared calendar | Another customer's active room commitment | Read availability as an unrelated Coordinator | Expose occupied timing/deadline, hide customer title, notes, Event link and internal flags | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-15 | Parent minimum capacity and independent breakout attendance | Planning Event minimum larger than its attendance; room below minimum; wrong Venue type | Search default needs, then an explicit smaller breakout | Default parent minimum/type enforced; smaller breakout assessed independently | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-16 | Explicit no-accessibility marker | Event accessibility NONE; catalogue without accessibility tags | Search and request | No invented NONE facility; immutable parent snapshot retains the source marker | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-17 | Mandatory accessibility cannot be dropped | Event needs wheelchair access; venue lacks it | Request with an empty room accessibility filter | 422 with missing accessibility; no booking | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-18 | Read-only operational closure label | Operational closure with private Staff notes | Read as Technical Support and attempt mutation | Shared closure title visible; private notes/actor hidden; write403 | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS36-19 | Deadline after slow upstream reads | Active hold; Venue lookup crosses the deadline | Read calendar, room search and Event summary with the delayed boundary | Calendar omits expired hold, search frees the room and summary reports EXPIRED using current time; stored row unchanged | Real HTTP / memory and controlled clock | 2026-10-12T22:04:26+08:00 |

## 13 October 2026 continuation cases

Date of Creation: 2026-10-13T17:31:06+08:00. Original source IDs and assertions above are preserved. Results below require their named layer; component/intent proof does not establish inbox delivery or human acceptance.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS36-20 | AC1/5/6: booking-specific alternative search | An authorized current Coordinator, a 40-person CLASSROOM breakout and a distinct suitable alternative | Search with bookingId and its read bookingVersion; repeat with stale version, another Event and former Coordinator | The original time, attendance, layout/facilities/access needs are prefilled; original venue excluded; no writes; stale409, foreign404, former403 | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |

## 13 October independent-audit regression cases

The cases below preserve current scope and original source assertions. Date of Creation: 2026-10-13T18:49:21+08:00.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS36-21 | AC3/6: removed historic venue calendar | Confirmed booking fully beyond its occupied end; venue legitimately deleted | Read an unfiltered future availability range | 200 empty projection; old booking/history/intent unchanged | Real HTTP boundary | 2026-10-13T18:49:21+08:00 |

## 13 October audit follow-up cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS36-22 | AC3/6: removed venue after buffer reduction | Approved advertised end has passed; old snapshot turnaround still future | Attempt deletion during actual turnaround (409); shorten buffer, recheck, delete (204), read calendars/conflicts | Legitimate serialized deletion is honored despite the longer historic snapshot; no rewrite of immutable past records | 2026-10-13T18:56:24+08:00 |

## 13 October final recovery and concurrency cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS36-23 | AC3/6: deletion/configuration race | Room advertised end passed, zero turnaround; deletion paused before private DELETE | Increase turnaround while deletion is in flight | Stale proof409; Venue and confirmed booking retained; retry blocks current occupancy | 2026-10-13T19:02:26+08:00 |

## Session 3 fixture reconciliation — 14 October 2026

Customer rows4/6 prohibit later buffer edits. Regression fixtures requiring old inconsistent buffer/booking snapshots now seed explicit isolated historical data; they do not exercise or endorse a public post-confirmation buffer edit. Recheck, conflict, immutability and deletion assertions remain. CS-36-23 now verifies deletion CAS using permitted name maintenance. The new buffer denial/fence cases are TC-CS84-31 through34. Dated earlier execution records are unchanged.
