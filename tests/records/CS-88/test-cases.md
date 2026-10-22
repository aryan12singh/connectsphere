# CS-88 test cases

Stable case inventory. Current preconditions, steps, data and assertions remain in the [Sprint 4 case sheet](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F104:U120). The [execution map](../../../docs/sprint4-venue-test-map.md) links each executable source; the [API contract](../../../docs/api-contract.md) reconciles historical route/status wording. Results belong in dated execution records.

| Case | Acceptance | Scenario |
|---|---|---|
| TC-CS88-01 | AC1 | Cancel one breakout room |
| TC-CS88-02 | AC2 | Change one booking's time |
| TC-CS88-03 | AC1 | Cancel then back out |
| TC-CS88-04 | AC1 | Organiser can't cancel a venue booking |
| TC-CS88-05 | AC6 | Venue change after safety approval |
| TC-CS88-06 | AC4 | Whole-event cancel releases all |
| TC-CS88-07 | AC3 | Last-venue warning |
| TC-CS88-08 | AC5 | Only the affected venue's staff are notified; history recorded |
| TC-CS88-09 | AC2 | Changing one booking keeps registrations and tells no Attendee yet |
| TC-CS88-10 | AC1 | Same-key retry of a single-booking cancel |
| TC-CS88-11 | AC1 | Former Coordinator can't cancel a booking after reassignment |
| TC-CS88-12 | AC3 | Last-venue warning needs explicit confirmation |
| TC-CS88-13 | AC1,AC3,AC6 | confirmed arrangement changes require the exact reviewed proposal and last venue cancellation requires explicit acknowledgement |
| TC-CS88-14 | AC5,AC6 | versioned current-Coordinator venue review reopens only Event planning, binds the exact source/proposal and appends replay-safe visible business history |
| TC-CS88-15 | AC1,AC5,AC6 | A reviewed cancellation resumes after a lost review acknowledgement or temporary Booking failure |
| TC-CS88-16 | AC4,AC5; bounded CS-54 consumer handoff | Source-proven whole-Event venue release refuses uncommitted actions and releases only its active venue arrangements once |
| TC-CS88-17 | AC1,AC5,AC6 | Definitive stale Event review and stale Booking cancellation recover from current versions |
