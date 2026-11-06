# CS-31 — Confirm an Event When Essential Arrangements Are Ready: test cases

Index of the automated cases for this story (3 November 2026). The Sprint 3 and Sprint 4 test sheets hold the scenario, data and dated results; the [traceability index](../../../docs/testing/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS31-01 | allowed rows: Planning → Confirm → Confirmed when Safety-approved and ready | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS31-02 | CS-32 — TC-CS32-01 TC-CS31-02 a Confirmed Event is read-only to its Organiser | Frontend page, component or BFF (Vitest) | [CS-32.spec.ts](../../../tests/specs/CS-32.spec.ts) |
| TC-CS31-04 | wrong actor is a 403 for every action (another Coordinator) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS31-06 | forbidden action per status is a 409 (Confirmed cannot be confirmed again) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS31-08 | Confirm and Begin preparation need current Safety approval | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS31-10 | wrong actor is a 403 for every action (Confirm by a Coordinator Lead) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS31-12 | completes Confirmed events whose end time has passed, once each; Preparation events complete too | Service unit (node --test) | [completion.test.js](../../../services/event-service/tests/unit/completion.test.js) |
| TC-CS31-13 | Completed only once the end time has passed | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |

## Differences from the sheet and cases not automated

- The confirm rules run in the single transition guard and are unit-tested there. The live confirm route (`POST /events/:id/confirm`) is exercised by the Safety journeys (CS-93 to CS-95).
- TC-CS31-13: the Event completes from its end time itself. The sheet's draft expects it to stay Confirmed at the end minute and complete one minute later.
- TC-CS31-06: a second confirm is refused with 409 by the guard. One-notification-only is not checked here.
- Not automated: TC-CS31-03 (browser), TC-CS31-05 (venue made unavailable after approval: CS-91 journeys), TC-CS31-07 (confirm relative to the start time; no such rule is built), TC-CS31-09 (equipment approved but not reserved), TC-CS31-11 (reassigned between page load and Confirm).
