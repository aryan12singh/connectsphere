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

## Sprint 2 regression additions

| Test Case ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Date of Creation |
|---|---|---|---|---|---|---|
| TC-CS33-09 | Reject reversed/equal operating hours atomically | Existing venue; Venue Staff; real PostgreSQL | Invalid POST, full PUT and hours PUT; reread data/history | opens09:00, closes08:00 or09:00 |422 field guidance; no venue, hours or history mutation | 2026-10-07 00:46:00 |
| TC-CS33-10 | Internal venue read and specific write roles | Disposable venue database and five authenticated role fixtures | Read venue as each role; attempt replacement as each | Same venue, full valid update body | Coordinator/Venue/Support read200, public roles403; only Venue Staff writes200 (PostgreSQL API and action guard unit) | 2026-10-07T02:48:16+00:00 |
| TC-CS33-11 | Venue form before hydration | Real signed-in Venue Staff; server HTML; JavaScript disabled | Open new-venue page before handlers attach; inspect fields/submit; normal component test still submits to reason step after mount | Seed Venue Staff | Native fields/submit disabled until mount; no lost input or native GET submission | 2026-10-07T03:00:17+00:00 |
