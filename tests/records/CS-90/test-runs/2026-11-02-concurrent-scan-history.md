# CS-90 run — 2 November 2026: concurrent deadline scans

**Trigger:** `CS-90.spec.ts` intermittently counted 11 `HOLD_EXPIRED` activity rows for 10 expired holds on unrelated PRs (notifications stayed at 10).

**Cause:** the background worker and the test's explicit scans overlap. A scan whose snapshot predates another scan's commit still locks the unchanged hold (`SKIP LOCKED` no longer skips it), so the activity insert ran twice while the outbox upsert deduplicated the notice.

**Change:** the deadline outbox row is inserted first with duplicates skipped; the activity row is written only when that insert lands.

| Case | Layer | Result |
|---|---|---|
| TC-CS90-17 | PostgreSQL 16, stale-snapshot interleave + 18 parallel scans over 6 holds | Passed on the change; on the previous code it fails with `{history: 2, intents: 1}` |
| holdNotifications unit (2) | Unit | Passed, including the lost-claim path |
| Booking suites | Unit/coverage 112, contract 15, PostgreSQL 33, hold spike | Passed; coverage 97.33 / 84.26 / 98.07 / 97.33 |
