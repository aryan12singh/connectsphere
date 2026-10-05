# CS-33 — Test Case Specification (IS212 / IEEE 829)

Story: *As venue staff, I want to manage venue records safely so that capacity and booking relationships remain valid.*

| Test Case ID | Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|
| TC-CS33-01 | Create a venue with all fields | Venue Staff authenticated | Submit a complete venue payload, then list venues | Physical venue with operating hours | Venue is persisted and appears in the list | HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-02 | Venue Staff edits capacity and another user refreshes | Venue exists; Venue Staff and Coordinator sessions available | Replace the venue with a new complete payload; request the list as Coordinator | Capacity changed from 100 to 150 | New capacity is persisted and returned to both authorized users | HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-03 | Coordinator cannot edit or delete a venue | Venue exists; Coordinator has `venues.view` only | Send PUT and DELETE as Coordinator | Existing venue ID | Both operations return 403 and the venue is unchanged | HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-04 | Non-numeric capacity is rejected | Venue Staff authenticated | Submit capacity as a string | `capacity: "abc"` | 422 field-level capacity guidance; no record is created or changed | Unit + HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-05 | Delete a venue with a linked blocking booking | Venue exists; booking service has a matching venue booking | Request DELETE | Matching `venueId`, status `TENTATIVELY_HELD` or `CONFIRMED`, `endAt >= now` | 409 `VENUE_HAS_BLOCKING_BOOKINGS`; venue remains persisted | Cross-service HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-06 | Delete any venue without blocking bookings | Physical, virtual, or hybrid venue exists; no current/future tentative/confirmed booking matches | Request DELETE, then GET the venue | Booking statuses outside the blocking set or no bookings | 204; subsequent GET returns 404 | Cross-service HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-07 | Capacity boundaries use externalized maximum | Venue Staff authenticated | Submit capacities at each boundary | `0`, `1`, `10,000`, `10,001` | `0` and `10,001` rejected; `1` and `10,000` accepted; maximum comes from `MAX_VENUE_CAPACITY` | Unit + HTTP contract | 2026-10-04 00:00:00 |
| TC-CS33-08 | Booking lookup failure fails closed | Venue exists; booking service unavailable | Request DELETE | Any venue ID | 503; venue remains persisted | Cross-service HTTP contract | 2026-10-04 00:00:00 |

## Blocking-booking rule

A booking blocks deletion only when its `venueId` matches and its status is
`TENTATIVELY_HELD` or `CONFIRMED` with `endAt` at or after the current instant.
This applies equally to physical, virtual, and hybrid venues. No deactivation
operation is part of CS-33.
