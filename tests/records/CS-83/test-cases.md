# CS-83 — Oversee Coordinator Assignments and Active Events: test cases

Index of the automated cases for this story, taken from the test names in the code (3 November 2026). The Sprint 4 test sheet holds the scenario, data and dated results; the [traceability index](../../../docs/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS83-01 | CS-83 — TC-CS83-01 only Leads see the oversight view | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-02 | CS-83 — TC-CS83-02 assigned work appears with its status, outstanding items and workload | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-03 | CS-83 — TC-CS83-03 the Lead reassigns from the oversight view, which stays read-only | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-04 | CS-83 — TC-CS83-04 a Coordinator cannot open the oversight view | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-05 | CS-83 — TC-CS83-05 Drafts, Rejected, Cancelled and Completed records are excluded | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-09 | CS-83 — TC-CS83-09 the status filter returns only that stage | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |
| TC-CS83-10 | CS-83 — TC-CS83-10 outstanding arrangements follow the Event state | Frontend page, component or BFF (Vitest) | [CS-83.spec.ts](../../../tests/specs/CS-83.spec.ts) |

## Differences from the sheet and cases not automated

All cases run through the real BFF, Event Service and PostgreSQL. Events are moved to Confirmed, Cancelled or Completed by direct setup; those flows have their own stories.

- TC-CS83-03 is a browser case in the sheet. The automated test covers the same rule at the API: only reassign is offered, the Lead cannot edit, and reassigning with the listed version moves the Event.
- TC-CS83-10: the outstanding labels are the ones Event Service knows ("Venue and technical arrangements", "Safety review", "Event confirmation"). Separate venue and equipment items join with the CS-32 checklist.
- Not automated: TC-CS83-06 (the at-risk highlight is waiting on the team/PO decision named in AC3), and TC-CS83-07, TC-CS83-08 and TC-CS83-11: agreed Not available for Release 1 (3 November team decision in [session3-decisions.md](../../../docs/session3-decisions.md)). Supervisory scopes are not recorded, so every Lead sees every active Event.
