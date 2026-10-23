# Sprint 4 Venue test mapping

Execution evidence records actual result, source identity, assertion stage, screenshots, raw query results and reruns separately. The following is a compact source map, not a claim that every case or human gate has passed.

| Cases | Executable source / assertion |
| --- | --- |
| TC-CS88-01–05,07–12 | `frontend/e2e/CS-88.spec.ts`: four-room scoped cancellation, retry/targeted Staff/history, last-venue Back/confirmation, one-room time change with 30 retained registrations, authorization/reassignment and current Safety. |
| TC-CS88-06 | Blocked: public CS-54 cancellation and its phase-aware committed-intent resource-release contract are pending. |
| TC-CS90-07 | `services/booking-service/tests/unit/arrangementChanges.test.js`: production HTTP decision guards at exact T−1s/T/T+1s with a controlled clock, supplementing real worker races. |
| TC-CS90-01–15 | `frontend/e2e/CS-90.spec.ts`: elapsed/persisted deadlines, fresh resubmit and conflict checks, single extension/history, 24h boundaries, 20 approval/expiry races, worker/broker restart and current Coordinator delivery. |
| TC-CS91-01–20,22–24 | `frontend/e2e/CS-91.spec.ts`: Staff UI impact/confirmation, categories/authorization/intervals, current recipients, buffered boundaries, explicit targeted restoration, retry deduplication. |
| TC-CS91-21; TC-CS92-01,02,08,09; TC-CS47-06 | `frontend/e2e/CS-92.spec.ts`: actual replacement request/Staff approval, immutable original/sibling/registration preservation, rejected restore, current Safety re-review/reconfirmation, final recipient delivery and effective attendee UI. |
| TC-CS92-02 / TC-CS52-02 audience regression | `frontend/e2e/CS-92.spec.ts` and Attendance HTTP tests: real effective time change notifies registered and waitlisted Attendees, skips Withdrawn and preserves each registration state. The separate 20-registered plus Organiser fixture still asserts 21 final notices. HTTP tests also cover Offered. |
| TC-CS92-15 | `services/event-service/tests/integration/workflows.test.js`: actual confirmation commands compare with the last committed Event confirmation, including approved-but-unpublished alternative rounds and a revert to the original venue. |
| TC-CS92-03–07,10–12 | `frontend/e2e/CS-92.spec.ts`: full requirement prefill, assignment/capacity/rejection retry, buffered touching/overlap and 20 restoration/approval/withdrawal races. |
| TC-CS88-15 | `frontend/e2e/CS-88.spec.ts` and `tests/specs/CS-87.spec.ts`: lost review acknowledgement and transient Booking failure retain the exact review request/key, one review and one committed cancellation. |
| TC-CS88-17 | Same sources: definitive Event/Booking version refusals refresh the reviewed intent and close an obsolete cancellation dialog; the current version then cancels once. |
| TC-CS88-14 | `services/event-service/tests/integration/workflows.test.js`: real PostgreSQL current-Coordinator review/version binding, replay-safe visible Event activity and immutable history. |
| TC-CS88-16 | Booking component tests, Event PostgreSQL tests and `frontend/e2e/CS-88.spec.ts`: controlled terminal-source release/recovery proof, exact accepted action/version, retries, Staff notices and unrelated/equipment/registration preservation. It requires an already-Cancelled Event and is not compatible with CS-54's pre-final `Cancelling` phase; TC-CS88-06 remains blocked. |
| TC-CS88-13; TC-CS90-16; TC-CS91-25; TC-CS92-13,14 | `services/booking-service/tests/unit/arrangementChanges.test.js`: stale/mismatched review, preview/idempotency, rejected-link readiness, explicit restoration and fresh-hold history. |
| TC-CS91-22,26 | `frontend/e2e/CS-91.spec.ts`: actual lost closure acknowledgement retries the exact path/method/key/body after switching forms; public fact edits suppress delayed old delivery. Booking HTTP/PostgreSQL and Notification unit/PostgreSQL tests additionally prove version-ordered facts, private-note silence and persisted current notices. |
| TC-CS92-16,17 | `frontend/e2e/CS-92.spec.ts` and Booking HTTP/PostgreSQL tests: expired pending alternatives retain their source fence; completed replacements allow ordinary reapproval and expiry recovery while preserving the retired original, explicit primary selection and current Safety. |

`services/attendance-service/tests/unit/projection.test.js` and `tests/integration/http.test.js` additionally verify actual Event identity, unready/outage handling, current Organiser ownership, public-field privacy and refusal of public Event/policy writes.

The existing CS-78 PostgreSQL proof remains separate from the production worker. Browser tests identify synthetic registration/reassignment/deadline preconditions explicitly; business changes use authenticated production APIs. Runtime test databases and broker stacks are isolated; no shared queue is consumed or shared volume reset. Earlier draft endpoint/status names are reconciled in the [API contract](api-contract.md).
