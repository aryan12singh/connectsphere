# CS-81 — View the Unassigned Event Request Queue: test cases

Index of the automated cases for this story, taken from the test names in the code (3 November 2026). The Sprint 4 test sheet holds the scenario, data and dated results; the [traceability index](../../../docs/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS81-01 | CS-81 — TC-CS81-01 a first submission is unassigned and waits for the Lead | Frontend page, component or BFF (Vitest) | [CS-81.spec.ts](../../../tests/specs/CS-81.spec.ts) |
| TC-CS81-02 | CS-81 — TC-CS81-02 only Leads see the queue | Frontend page, component or BFF (Vitest) | [CS-81.spec.ts](../../../tests/specs/CS-81.spec.ts) |
| TC-CS81-03 | CS-81 — TC-CS81-03 assigning removes the request from the queue | Frontend page, component or BFF (Vitest) | [CS-81.spec.ts](../../../tests/specs/CS-81.spec.ts) |
| TC-CS81-06 | TC-CS81-06 a new unassigned request notifies every active Lead with a queue link and tells the Organiser a Lead will assign | Service unit / HTTP contract | [notifications.test.js](../../../services/notification-service/tests/unit/notifications.test.js) |
| TC-CS81-06b | TC-CS81-06b a request that already has a Coordinator sends no Lead notice, and a Lead lookup outage is retried then recorded as FAILED | Service unit / HTTP contract | [notifications.test.js](../../../services/notification-service/tests/unit/notifications.test.js) |
| TC-CS81-06c | TC-CS81-06c delivery stores one Lead notice per Lead and a replay creates no duplicate | Service unit / HTTP contract | [notifications.test.js](../../../services/notification-service/tests/unit/notifications.test.js) |

### Lead supervisory scopes (3 November)

AC6: the intake notice goes to every active Lead. Per-Lead supervisory scopes are an agreed Not available for Release 1 (3 November team decision in [session3-decisions.md](../../../docs/session3-decisions.md)), so a scope-limited notice is not tested.
