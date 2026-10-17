# CS-51 — Test Case Specification (IS212 / IEEE 829)

Story (Jira CS-51): *As an Organiser or staff member, I want planning
decisions and warnings delivered to me so that I know what action is needed.*

Test IDs follow the PO's sprint test sheet (2026-10-17). Updated for `main`
at `7867f24` (PR #11), which added the real producers: booking-service and
event-service outbox relays → RabbitMQ → notification consumer. The consumer
re-reads current state before delivering, so stale messages (old hold
deadline, replaced decision or Safety round, reassigned Coordinator) are
suppressed.

| Test Case ID | Scenario | Notice behaviour (notification-service) | Real producer on main | How to execute | Status |
|---|---|---|---|---|---|
| TC-CS51-01 | Coordinator told of a venue rejection with the reason | `BookingDecided` REJECTED → Coordinator `VENUE_REJECTED` with reason; Organiser `VENUE_DECISION` without it. unit + contract `test_cs51_01` pass | booking-service `VenueBookingRejected` | Venue Staff rejects a request with a reason; check the Coordinator's bell. Link is `/venue` (no `/venue-bookings/B1` page) | Notice: Pass. Live: run |
| TC-CS51-02 | Venue made unavailable after booking | `VenueUnavailable` → Coordinator `VENUE_UNAVAILABLE` (kept, marked for replacement); Organiser `VENUE_CHANGE_NEEDED`, no reason. unit pass | booking-service re-check when a Staff block covers a booking | Staff blocks a window over a booked slot | Notice: Pass. **Differs from sheet A2:** main flags the booking `BUFFER_CONFLICT`, not `NEEDS_REPLACEMENT`. Agree with Aryan/PO |
| TC-CS51-03 | Venue Staff get a new-request notice and open it | `BookingRequested` → every active Venue Staff member. unit + contract `test_cs51_03` pass | booking-service `VenueRequested` | Coordinator requests a venue; Venue Staff bell shows "New booking request"; click opens `/venue` (no `/venue-bookings/B…/review` page) | Notice: Pass. Live: run |
| TC-CS51-04 | Organiser gets no internal staff notices | No `VENUE_UNAVAILABLE`/`BUFFER_CONFLICT` or internal reason for the Organiser. unit + contract `test_cs51_04` pass | — | Check the Organiser's bell after 01/02 | Pass |
| TC-CS51-05 | Extending a hold moves the expiry warning | `HoldExpiring` keyed by booking + deadline; consumer drops a warning whose deadline is no longer current | booking-service hold scheduler + `VenueHoldExtended` | Extend a hold before its warning time, then let the scheduler run | Live: run |
| TC-CS51-06 | Safety change request only alerts the affected area | `SafetyChangesRequested` areas → Technical Support for EQUIPMENT/TECHNICAL, Venue Staff for VENUE, plus Coordinator and Organiser (comment only). unit + contract `test_cs51_06` pass | event-service Safety decision | Safety Officer requests changes for EQUIPMENT only | Notice: Pass. Live: run |
| TC-CS51-07 | Hold-expiry warning time (24 h before) | Timing is the scheduler's (booking-service, `docs/hold-expiry.md`) | booking-service | Controlled clock in the booking-service hold tests | Owned by the hold story |

## Extra cases

| Test Case ID | What it proves | Automation | Status |
|---|---|---|---|
| TC-CS51-08 | Return-for-amendment notice carries the Coordinator's comments | unit; event-service PG `TC-CS51-08e`; **live through RabbitMQ 2026-10-17**: notice read `The Coordinator's comments: "Add layout"` | Pass |
| TC-CS51-09 | One approved venue is not reported as the whole event ready | unit | Pass |
| TC-CS51-10 | Staff-list lookup failure retried, then Failed, no partial notices | unit | Pass |

"Live: run" = the real producer exists on main. Execute it with the app
running (`docker compose -f infra/docker-compose.yml up -d --build`), or
with the repository runner `scripts/run-event-review-ci.sh`
(see `docs/sprint3-integration-handoff.md`). Record the date, commit and
result here.

## Not covered yet
- Technical request/decision/reservation notices (card AC3): no templates yet.
- Cancellation and replacement notice types (card AC8 future types).
