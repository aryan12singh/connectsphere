# CS-40 — Test Case Specification (IS212 / IEEE 829)

Date of Creation: 2026-10-17T18:00:00+08:00. Story: record and review one pooled equipment and technical-support request for an Event. Jira governs; prototype rules are the two supplements. Historical execution records are immutable.

| Test Case ID | Scenario | Pre-conditions | Test Steps / Test Data | Expected Result | Automated evidence | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS40-01 | Pooled equipment/support submit | Current Coordinator | Submit projector, support and placement | Pending version, actor/time/history/outbox | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-02 | Invalid request | Current Coordinator | Unknown, zero, malformed line | Field errors; no side effects | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-03 | Meaningful rejection | Pending request | Support rejects with reason | Reason/actor/time/version readable; no proof | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-04 | Blank rejection | Pending request | Reject whitespace | No decision/history/outbox mutation | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-05 | Support-only | Current Coordinator | Zero equipment, support details | Pending Support decision, not ready | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-06 | Explicit not-required | Current Coordinator | Empty request, notRequired true | Versioned NOT_REQUIRED; no reservation | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-07 | Superseded revision | Approved v1 | Submit v2; decide v1 | v1 cannot authorize v2 | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-08 | Current assignment | Reassigned request | Former/current/foreign Coordinator actions | Former/foreign denied; current scoped | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-09 | Safety read-only | Permitted Safety relationship | Read then edit/decide | Read allowed; writes denied | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-10 | Multi-room pool | Two venue allocations | Request two rooms same type | One Event demand; no duplicate pool | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-11 | Competing decisions | Same pending version | Concurrent approve/reject/retry | One authoritative decision/action | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-12 | Failure/outbox | Fault injection | Fail before/after commit | Rollback or durable outbox as applicable | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-13 | Accessible browser workflow | Desktop/mobile | Form, validation, review, refresh | Correct states and no false success | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-14 | Stock ceiling (supplement) | Known physical stock | Request stock + 1 | Whole request rejected | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-15 | Limits/declaration (supplement) | Current Coordinator | 1001 support, 501 placement, conflict | Exact validation; no partial write | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS40-16 | Venue per line | Current Coordinator and available venue | Choose equipment, quantity and venue | Submission retains selected venue | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-21T14:01:09+08:00 |
| TC-CS40-17 | Missing venue | Current Coordinator requests equipment | Leave venue empty and submit | Browser blocks submission with no write | [E2E](../../../frontend/e2e/CS-40.spec.ts) | 2026-10-21T14:01:09+08:00 |

## Historical ID mapping

TC-CS40-01 also verifies that the server-rendered form controls stay disabled until hydration, so an early equipment/venue selection cannot be lost before the browser handlers are ready. This supplements the existing disabled-submit assertion and preserves the full submission flow.

The following mappings describe the earlier 17 October numbering, before the new venue cases 16/17 above. Earlier local 03 blank-reason maps to canonical **04**; local 04 reason visibility maps to **03**. Local 16/19 map to **06**, local 17/18 to supplements **14/15**, and local 08 is split across **08** assignment and **09** Safety read-only.

## Repository-only proposed supplement

This case is an implementation/UI supplement beyond the Jira acceptance criteria. It is not a spreadsheet or Jira acceptance criterion.

| Test Case ID | Scenario | Pre-conditions | Test Layers | Expected Result | Automated evidence | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS40-18 | View historical technical requirements as a read-only snapshot | A technical request has at least two saved versions; authorized current Coordinator is signed in | **Unit**<br>File: `services/equipment-service/tests/unit/store.test.js`<br>Save two versions and verify each history entry retains its own immutable request snapshot.<br><br>**Integration**<br>File: `services/equipment-service/tests/integration/http.test.js`<br>Read history through the real endpoint; verify version ordering, snapshot values, and current-Coordinator authorization.<br><br>**E2E**<br>File: `frontend/e2e/CS-40.spec.ts`<br>Open an older version from history; verify its saved values are prefilled, controls are read-only, and viewing it leaves the current request unchanged. | Each historical version displays its saved values without allowing edits or changing the current request. | Unit: Passed (`npm run test:unit`); Integration: Passed (18/18 HTTP tests); E2E: Blocked — local application stack unavailable at `127.0.0.1:33000` | 2026-10-24T17:32:14+08:00 |
