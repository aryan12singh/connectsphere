# CS-32 — Maintain Event Status and Transition Rules: test cases

Index of the automated cases for this story (3 November 2026). The Sprint 3 and Sprint 4 test sheets hold the scenario, data and dated results; the [traceability index](../../../docs/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS32-01 | allowed rows (Confirm); CS-32 — TC-CS32-01 a Confirmed Event is read-only to its Organiser | Service unit (node --test); Frontend page, component or BFF (Vitest) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js); [CS-32.spec.ts](../../../tests/specs/CS-32.spec.ts) |
| TC-CS32-02 | CS-32 — TC-CS32-02 each transition records the old and new status, actor and time | Frontend page, component or BFF (Vitest) | [CS-32.spec.ts](../../../tests/specs/CS-32.spec.ts) |
| TC-CS32-04 | wrong actor is a 403 for every action (Confirm called directly by the Organiser) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-05 | forbidden action per status is a 409 (Draft cannot be approved) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-06 | confirm needs every arrangement complete (none complete) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-07 | confirm needs every arrangement complete (n−1 of n, then n of n) | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-08 | allowed rows (Begin preparation); Confirm and Begin preparation need current Safety approval | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-09 | forbidden action per status is a 409 (closed statuses); CS-32 — TC-CS32-09 closed records allow no further transitions | Service unit (node --test); Frontend page, component or BFF (Vitest) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js); [CS-32.spec.ts](../../../tests/specs/CS-32.spec.ts) |
| TC-CS32-10 | allowed rows; wrong actor is a 403 for every action; every action in the table has a row | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |
| TC-CS32-11 | label map, displayStatus, every status has a label, frontend screens use the shared label map | Service unit (node --test) | [transitions.test.js](../../../services/event-service/tests/unit/transitions.test.js) |

## Cases not automated

- TC-CS32-03 (browser: tick the last outstanding arrangement).
- TC-CS32-12 (two tabs: cancel then confirm on the same version). Both routes check the version, but this exact race has no test.
