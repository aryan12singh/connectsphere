# CS-12 — Review, Approve, Reject or Return an Assigned Event Request: test cases

Index of the automated cases for this story, taken from the test names in the code (3 November 2026). The Sprint 4 test sheet holds the scenario, data and dated results; the [traceability index](../../../docs/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS12-01 | CS-12 — TC-CS12-01 only the assigned Coordinator approves | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-02 | CS-12 — TC-CS12-02 approval is shown as Planning and written once to the outbox | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-03 | CS-12 — TC-CS12-03 simultaneous approvals give one transition | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-04 | CS-12 — TC-CS12-04 a stale version is refused and changes nothing | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-05 | CS-12 — TC-CS12-05 reject needs a reason, closes the request and tells the Organiser why | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-06 | CS-12 — TC-CS12-06 return needs comments and keeps the same Coordinator | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
| TC-CS12-07 | CS-12 — TC-CS12-07 a Planning-stage rejection closes the request and the Event together | Frontend page, component or BFF (Vitest) | [CS-12.spec.ts](../../../tests/specs/CS-12.spec.ts) |
