# CS-41 — Test Case Specification (IS212 / IEEE 829)

Date of Creation: 2026-10-17T18:00:00+08:00. Equipment uses Booking's occupied windows, including the user-approved venue setup/turnaround buffer override, and adds no second equipment buffer.

| Test Case ID | Scenario | Pre-conditions | Test Steps / Test Data | Expected Result | Automated evidence | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS41-01 | Complete-request availability | Demand 3/1, available 2/4 | Check current period | Lines 1/0 short; whole request false | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-02 | Availability edges | Stock/current request | Exact, one-short, zero | Bounded exact/short results | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-03 | Half-open overlap | Adjacent/overlap commitments | Check both clocks | Touching free; overlap consumes | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-04 | Reservation + operation | Stock 5, reserve 2, operation 1 | Check shared/free window | Available 2 then 5; never negative | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-05 | Dated check | Current request | Repeat check | Snapshot/time; no commitment/outbox | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-06 | Old check stale | Earlier sufficient check | Other Event reserves, recheck | Later shortage; old result dated only | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-07 | Pool room demand | Two rooms | Check total 2 | Counted once Event-wide | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-08 | Access | Support/current/former/foreign | Read/check/write | Support write-only; denials unchanged | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-09 | Operation flags reservation | Active reservation | Mark overlap unavailable | Reservation/history retained; proof stale | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-10 | Invalid/replayed operation | Invalid and retry fixtures | Submit/retry/race | Invalid unchanged; one valid operation | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-11 | Status UI | Support session | View/refresh/restart | Lines/flags/time/errors persist | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-12 | Buffered period (supplement) | Booking occupied windows | Pool earliest/latest | Venue buffers define period exactly | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-13 | Allocation projection (supplement) | Confirmed + expired hold | Read private projection | Current versioned confirmed rows only | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-14 | Inventory (supplement) | Support inventory | Edit/stale/Coordinator action | Versioned Support-only edit | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS41-15 | Independent review columns | Desktop and mobile Support sessions | Scroll queue and details then resize | Desktop columns scroll independently; mobile stacks | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-21T14:01:09+08:00 |
| TC-CS41-16 | Review detail projection | Support request with venue allocation | Open request detail | Legacy venue-allocation section is absent | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-21T14:01:09+08:00 |
| TC-CS41-17 | Availability venue names | Support request with selected venue | Read dated equipment availability | Venue column displays resolved venue name | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-21T14:01:09+08:00 |
| TC-CS41-18 | Reserved venue names | Approved Support request with venue | Reserve all lines and read detail | Reserved equipment retains venue column and name | [E2E](../../../frontend/e2e/CS-41.spec.ts) | 2026-10-21T14:01:09+08:00 |

## Historical ID mapping

Earlier buffered-period/projection/inventory cases map to **12/13/14**. Earlier availability fixture incorrectly used unavailable two; canonical **04** uses reservation two plus operation one.

The additional venue-display checks formerly named 11a/11b/11c now use distinct canonical cases 16/17/18; their assertions are retained.

TC-CS41-14 also verifies that the server-rendered stock tab remains disabled until hydration, so its first click opens the stock controls reliably (2026-10-21T16:12:00+08:00).
