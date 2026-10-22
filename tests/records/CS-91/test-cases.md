# CS-91 test cases

Stable case inventory. Current preconditions, steps, data and assertions remain in the [Sprint 4 case sheet](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F137:U162). The [execution map](../../../docs/sprint4-venue-test-map.md) links each executable source; the [API contract](../../../docs/api-contract.md) reconciles historical route/status wording. Results belong in dated execution records.

| Case | Acceptance | Scenario |
|---|---|---|
| TC-CS91-01 | AC1, AC3, AC4 | Unavailability over two booked events |
| TC-CS91-02 | AC6 | Shortening makes the booking restorable; explicit Staff confirmation clears its flag |
| TC-CS91-03 | AC2 | Preview of affected events before saving |
| TC-CS91-04 | AC1 | Coordinator can't record unavailability |
| TC-CS91-05 | AC5 | New bookings blocked during the period |
| TC-CS91-06 | AC3 | Original event information preserved |
| TC-CS91-07 | AC2 | Unavailability end vs occupied setup start: touching free, positive overlap affected |
| TC-CS91-08 | CS-34 AC1 (+W7); 34-09 (New) | Booking inside unavailability |
| TC-CS91-09 | CS-35 AC1, AC3; 35-01 | Valid block |
| TC-CS91-10 | CS-35 AC1; 35-02 | Click an empty slot |
| TC-CS91-11 | CS-35 AC1; 35-03 | Coordinator creates a block |
| TC-CS91-12 | CS-35 AC2; 35-04 | End before start |
| TC-CS91-13 | CS-35 AC4 (resolved by W7); 35-05 (Updated) | Block over an existing booking |
| TC-CS91-14 | CS-35 AC3; 35-06 | Book during a block |
| TC-CS91-15 | CS-35 AC2; 35-07 | End = start vs start + 1 min |
| TC-CS91-16 | CS-35 AC4 (+W7); 35-08 (New) | Block doesn't cancel the event |
| TC-CS91-17 | CS-35 AC1 (+W7); 35-09 (New) | Equipment failure reason |
| TC-CS91-18 | CS-35 AC4 (+W7); 35-10 (New) | Block start vs booking turnaround end (12:45) |
| TC-CS91-19 | AC4 | Organiser gets an actionable notice; Attendees get none |
| TC-CS91-20 | AC6 | Removing the block does not silently restore the booking |
| TC-CS91-21 | AC6, AC7 | Replaced booking is not revived |
| TC-CS91-22 | AC7 | Retried save doesn't duplicate flags or messages |
| TC-CS91-23 | AC2, AC3 | Active holds in the window are listed and flagged too |
| TC-CS91-24 | AC6 | Restore needs the full occupied interval free |
| TC-CS91-25 | AC1,AC2,AC3,AC7 | current impact proof is required; operational category and private note persist, same-key save has one logical impact |
| TC-CS91-26 | AC4,AC7 | Edited public closure facts refresh actionable notices and suppress stale delayed delivery |
