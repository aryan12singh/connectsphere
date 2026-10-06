# CS-29 — Test Case Specification (IS212 / IEEE 829)

Blue section. Written from the current Jira snapshot and implementation instructions. Matrix limits and history granularity remain provisional; execution evidence is separate.

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|---|
| TC-CS29-01 | 1,6 | Incomplete draft boundary and shared form | New form | Observe empty Save; enter only purpose; attempt incomplete form action | No title; one meaningful purpose | Empty Save disabled; one field enables Save; novalidate permits draft action | Component + live browser | 2026-10-06 |
| TC-CS29-02 | 1,2,3,4 | Durable private draft and same-ID submit | Owner and assigned/other users; isolated PG | Save incomplete; replay same key; reopen after restart; complete and submit | One purpose; complete CS11 matrix | Private owner record survives; no assignment/submission outbox until submit; ID unchanged | Real BFF + PG + live auth/restart | 2026-10-06 |
| TC-CS29-03 | 5 | Failed and stale saves | Committed draft version | Send invalid data then two edits against same version | Bad attendance; changed names | Validation retains committed row; stale request409; unsaved UI inputs retained | Real BFF + PG + component | 2026-10-06 |
| TC-CS29-04 | 6 | Unsaved navigation warning and no expiry | Owner editing unsaved draft | Attempt navigate; cancel; then save and navigate; reopen retained draft | Changed purpose | Cancel keeps inputs; after save navigation succeeds; no expiry job or delete endpoint | Native browser + source inspection | 2026-10-06 |

TCs with a manual or real-route layer are not proved solely by a component execution record. API evidence is in the external test-results JSON and logs; native-browser evidence has its own dated record.
