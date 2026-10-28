# CS-52 — Notify Attendees of Registration Outcomes and Event Changes

Owner: Marc (Shadow). Sprint 4. Created 2026-10-27. One case per Jira acceptance criterion. If the Sprint 4 test sheet uses different IDs, keep the sheet's IDs and map them here.

Automated file: `services/notification-service/tests/unit/cs52-attendee-outcomes.test.js` (run with `npm run test:unit` in `services/notification-service`).

| Test Case ID | AC | Scenario | Expected result | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| TC-CS52-01 | AC1 | Registration, waitlist join, offer made/expired/accepted and withdrawal messages are delivered | Each creates one notice for the named Attendee only, with an Attendee-safe link and data. Nobody else is notified. | Unit TC-CS52-01. Live: `RegistrationCreated` only. Waitlist rows are contract-only (CS-48 excludes the waitlist in Release 1); withdrawal waits for CS-49. | Passed (registration live-capable; others contract-only) |
| TC-CS52-02 | AC2 | Effective confirmation after a venue replacement among several venues | Every active Attendee gets one `VENUE_CHANGED` notice with the final date/time and all venue names. Registrations are only read, never changed. A confirmation with no attendee-facing change notifies only the Organiser. | Unit TC-CS52-02; event-service TC-CS48-11 for the snapshot; CS-92 E2E for registrations kept. | Passed |
| TC-CS52-03 | AC3 | Whole-Event cancellation | Each registered/waitlisted Attendee gets one `EVENT_CANCELLED` notice (publisher snapshot or attendance lookup). | Unit TC-CS52-03; `venue-changes.test.js` checks the exact cancellation proof. The real publisher is Javier's CS-54. | Passed (consumer); publisher pending CS-54 |
| TC-CS52-04 | AC4 | Pending change, replacement or Safety step; affected venue | No Attendee notice until the effective confirmation. A stale or pending `EventConfirmed` is ignored. The Organiser gets `VENUE_CHANGE_NEEDED` immediately. | Unit TC-CS52-04 | Passed |
| TC-CS52-05 | AC5 | Messages carrying private reasons, comments, evidence and other Attendee IDs | Attendee notice text, link and data contain none of them, and no planning request ID. Withdrawn Attendees are left out by the recipient lookup. | Unit TC-CS52-05; attendance `notificationRecipients` excludes `WITHDRAWN`. | Passed |
| TC-CS52-06 | AC6 | Recipient lookup fails once; same message redelivered; two distinct changes | Retry succeeds with no duplicate notice; redelivery is a duplicate; two changes give two notices. The lookup is a read-only GET with the internal key. | Unit TC-CS52-06; PG `postgres.test.js` checks the unique (message, recipient, type) key. | Passed |

## Runs

- 2026-10-27, main `af7b92c` plus this change: notification unit 36/36, coverage gate passed (all files 86.9% lines), contract 12/12, PostgreSQL integration 6/6.
