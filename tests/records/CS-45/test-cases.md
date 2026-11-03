# CS-45 — Review Event Changes and Reassess Affected Arrangements: test cases

Index of the automated cases for this story (3 November 2026). The Sprint 3 and Sprint 4 test sheets hold the scenario, data and dated results; the [traceability index](../../../docs/test-traceability.md) maps every story.

| Test Case ID | Automated test | Layer | File |
|---|---|---|---|
| TC-CS45-01 | CS-45 — TC-CS45-01 a proposal changes nothing until it is decided | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-02 | CS-45 — TC-CS45-02 who may propose and decide | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-03 | CS-45 — TC-CS45-03 validation | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-04 | CS-45 — TC-CS45-04 rejecting changes nothing | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-05 | CS-45 — TC-CS45-05 TC-CS45-21 approval applies the values, reopens planning and announces once | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-06 | CS-45 — TC-CS45-06 TC-CS45-19 a stale proposal is not applied | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-17 | CS-45 — TC-CS45-17 the assigned Coordinator proposes on the Organiser's behalf | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-19 | CS-45 — TC-CS45-06 TC-CS45-19 a stale proposal is not applied | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-20 | CS-45 — TC-CS45-20 an approved change to a Confirmed Event reopens planning and needs a new Safety round | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |
| TC-CS45-21 | CS-45 — TC-CS45-05 TC-CS45-21 approval applies the values, reopens planning and announces once | Frontend page, component or BFF (Vitest) | [CS-45.spec.ts](../../../tests/specs/CS-45.spec.ts) |

## Case IDs and differences from the sheet

TC-CS45-01 to 06 are the IDs the tests were written under. The Sprint 4 sheet lists TC-CS45-17 to 24, so the sheet cases each test also covers are named beside it.

- TC-CS45-19: only one proposal can be open at a time, so the sheet's two-proposal setup cannot occur. The test makes the request change after the proposal instead; approval is refused with 409 STALE_PROPOSAL.
- TC-CS45-21: a repeated approval returns 200 with one approval, one history row and one announcement. It uses a new key, not a same-key replay.
- TC-CS45-20: covers the Event Service part (Planning again, Safety state STALE, open round superseded). Confirm being blocked without a current Safety round is unit-tested under TC-CS31-08.
- Venue re-review is pull-based: booking-service compares each booking's requirements fingerprint and flags REQUIREMENTS_CHANGED (CS-86/CS-88 tests).
- Not automated: TC-CS45-18 (sibling venue bookings stay approved), TC-CS45-22 (booking-service failure during apply), TC-CS45-23 (browser before/after view), TC-CS45-24 (an approved booking change releases only its old hold).

### Decision notices (3 November)

An approved or rejected change now notifies the Organiser (`CHANGE_APPROVED`, which says when the Event is back in planning, or `CHANGE_REJECTED` with the Coordinator's reason). Tests: `services/notification-service/tests/unit/technical-and-change-notifications.test.js`. The Event Service already wrote `EventChangeApproved` and `EventChangeRejected`; the approval now also carries `reopened`.
