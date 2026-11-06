# CS-43 — View and Update Event Planning Information: test cases

Index of the automated cases for this story, taken from the test names in the code (3 November 2026). The Sprint 4 test sheet holds the scenario, data and dated results; the [traceability index](../../../docs/testing/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS43-01 | CS-43 — TC-CS43-01 only the assigned Coordinator edits, and the old and new values are recorded | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-02 | CS-43 — TC-CS43-02 significant fields, blank text and stale versions are refused | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-03 | CS-43 — TC-CS43-03 the Lead and the Safety Officer cannot edit planning details | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-04 | CS-43 — TC-CS43-04 an Organiser edits only their own Draft or Returned request | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-05 | CS-43 — TC-CS43-05 a significant field cannot be edited directly | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-06 | CS-43 — TC-CS43-06 a pending change review cannot be bypassed | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-07 | CS-43 — TC-CS43-07 a stale version is refused on PostgreSQL | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-08 | CS-43 — TC-CS43-08 reassignment removes the former Coordinator at once | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-09 | CS-43 — TC-CS43-09 invalid, unchanged and retried edits | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-11 | CS-43 — TC-CS43-11 edit history stays with people on the request | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |
| TC-CS43-14 | CS-43 — TC-CS43-14 a routine edit on a Confirmed Event keeps it Confirmed | Frontend page, component or BFF (Vitest) | [CS-43.spec.ts](../../../tests/specs/CS-43.spec.ts) |

## Differences from the sheet and cases not automated

All cases run through the real BFF, Event Service and PostgreSQL. The Coordinator edits the routine wording directly: description and purpose (3 November). Requests have no contact fields, so the tests use these where the sheet uses `contactPhone`. Every other field goes through a change proposal.

- TC-CS43-02 in the sheet covers Venue and Technical Staff section edits. Those edits go through the booking and equipment workflows (CS-37/38, CS-40–42), not a planning section on the Event. The automated TC-CS43-02 covers refused fields, blank text and stale versions.
- TC-CS43-03: the edit refusals are automated. The sheet also expects the Lead and Safety Officer to read the Event (200). As built, the Lead reads assigned work through the CS-83 oversight view (GET on an assigned request is 403), and the Safety Officer reads it through Safety review. That expectation needs a decision before it can be automated.
- TC-CS43-05: a direct date change is refused with 422 VALIDATION_FAILED and a message pointing to a change proposal. The sheet's draft code is 409 CHANGE_REQUEST_REQUIRED. The proposal route returns 200 PENDING, and its Safety reassessment is covered by CS-45.
- TC-CS43-09: a no-op edit returns 409 NO_CHANGES without a new version.
- Not automated: TC-CS43-10 and TC-CS43-12 (browser journeys), and TC-CS43-13 (preparation updates, covered by the Safety and preparation tests).
