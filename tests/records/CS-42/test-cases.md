# CS-42 — Test Case Specification (IS212 / IEEE 829)

Date of Creation: 2026-10-17T18:00:00+08:00. Equipment consumes Booking/Event/Safety interfaces and does not implement their cancellation, assignment, venue-booking or notification-delivery stories.

| Test Case ID | Scenario | Pre-conditions | Test Steps / Test Data | Expected Result | Automated evidence | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS42-01 | Complete approved reserve | Approved two-line request | Reserve current version | Lines/provenance/proof and one logical action | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-02 | Atomic shortage | First sufficient, second short | Reserve | All shortfalls; no partial rows/actions | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-03 | Obsolete approval | Unapproved/superseded request | Reserve | Meaningful failure; unchanged | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-04 | Role restriction | Non-Support actors | Reserve attempts | Technical Support only | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-05 | Period/operation recheck | Touching/overlap/op fixture | Reserve each interval | Half-open buffered supply | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-06 | Pooled reservation | Two-room demand | Reserve | One Event quantity exactly once | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-07 | Concurrent contention | Events demand 2 of stock 3 | Parallel reserve | At most one winner/no overcommit | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-08 | Idempotency | Same key | Replay reserve | One reservation/history/outbox | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-09 | Rollback | Fault injection | Reserve/recover | No partial then one recovery | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-10 | Broker/restart proof | Broker down/restart | Read/replay | Durable current proof/no duplicate | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-11 | Retain dependencies | Booking/Safety dependency action | Refresh readiness | Commitment retained; reassessment explicit | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |
| TC-CS42-12 | Technical replacement | Existing reservation/revised approval | Replace reserve | Atomic replacement; failure preserves old; CS-46 cancel excluded | [E2E](../../../frontend/e2e/CS-42.spec.ts) | 2026-10-17T18:00:00+08:00 |

## Historical ID mapping

Earlier touching-boundary coverage maps to **05**. Earlier full reservation/Safety flow maps to **01**; foreign CS-41 and CS-93 IDs do not belong in this story's E2E file.
