# CS-88 run — 2 November 2026: whole-Event cancellation (TC-CS88-06)

**Source:** branch `fix/aryan-sprint4-stability-ci` on main `c0292ed` (CS-54 public cancellation and runner merged), local isolated stack via `scripts/run-event-review-ci.sh` with `CSE2E_STAGE=browser`.

| Case | Layer | Result |
|---|---|---|
| TC-CS88-06 | Live Kong/Keycloak/PostgreSQL/RabbitMQ, desktop and mobile | Passed 2/2 |
| TC-CS88-18 | Same run, regression | Passed 2/2 |

The Coordinator cancels through `POST /api/events/:requestId/cancel`. The cancellation runner releases two approved bookings and one hold with their buffered intervals (3 `VenueCancellationReleased`), releases the equipment reservation, and finalizes once (`CANCELLED`, one `EventCancelled`). An unrelated Event's booking is unchanged, replaying the same action returns the same acceptance, and the registered Attendee receives one `EVENT_CANCELLED` notice. The request page shows "This Event is cancelled. Its records are kept."

**Defect found and fixed:** the first run passed every release assertion but no Attendee notice arrived. notification-service marked every `EventCancelled` as ignored because it compared the message's final Event version with the proof's accepted version; it now uses `currentEventVersion` for a Coordinator cancellation proof.

Evidence: `Project Working Files/Evidence/sprint4-stability-2026-11-02/TC-CS88-06` and the Sprint 4 case sheet.
