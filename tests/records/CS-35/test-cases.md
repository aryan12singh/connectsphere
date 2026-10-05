# CS-35 — Test Case Specification (IS212 / IEEE 829)

Story: *As Venue Staff, I want to create availability blocks from the venue calendar so that periods unavailable for booking are visible and respected by the booking workflow.*

| Test Case ID | Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|
| TC-CS35-01 | Happy path — create a valid block | Venue Staff authenticated and authorised for the venue; calendar loaded | Open the block form, enter a valid interval and reason, submit, then reload availability | `venueId`, valid local start/end, `timeZone`, non-empty reason, `status=BLOCKED` | BFF accepts and persists the block; it appears with block styling and only once after refresh | Frontend + BFF integration | 2026-10-04 16:33:00 |
| TC-CS35-02 | Workflow — click an empty calendar slot | Venue Staff authenticated; selected slot has no booking or block | Click an empty slot and inspect the block form before submitting | Selected date, slot start time, venue time zone | Form opens with venue/date/time pre-filled; values remain editable; opening the form does not POST | Frontend component integration | 2026-10-04 16:33:00 |
| TC-CS35-03 | Cross-cutting — coordinator tries to create a block | Event Coordinator authenticated; venue and empty interval exist | Open the block flow as coordinator and attempt a direct BFF submission | Valid block payload; coordinator session | UI hides/disables the action when permissions are known; direct `POST /api/bookings` returns 403; no block is persisted | Frontend + BFF authorization integration | 2026-10-04 16:33:00 |
| TC-CS35-04 | Negative — end time before start time | Venue Staff authenticated; block form open | Enter a start time, an earlier end time, and submit | `startAt=2026-12-22T10:00:00+08:00`, `endAt=2026-12-22T09:00:00+08:00` | Field guidance appears; BFF/service rejects the invalid request with the standard validation shape; no block is created | Frontend + BFF/API integration | 2026-10-04 16:33:00 |
| TC-CS35-05 | Negative — block overlaps an existing booking | Venue Staff authenticated; selected interval overlaps one or more existing bookings; availability loaded | Start creating a block over the occupied interval and inspect the conflict state; follow the approved continue/cancel control | Existing booking IDs/event names plus proposed `BLOCKED` interval | UI warns and lists affected events/bookings; it does not fabricate a server 409 when conflict handling is client-only; cancel leaves data unchanged, while confirmed submission follows the approved workflow | Frontend integration | 2026-10-04 16:33:00 |
| TC-CS35-06 | Negative — try to book during a block | A `BLOCKED`, `TENTATIVELY_HELD`, `CONFIRMED`, `BLOCKED`, `UNAVAILABLE` interval is persisted; booking-capable user authenticated | Create a booking whose interval lies within the block and submit through the normal UI | Same `venueId`; booking interval fully inside the block | Booking is rejected client-side with the agreed conflict error/field guidance; no booking is persisted; block remains visible. | Frontend + BFF/service integration | 2026-10-04 16:33:00 |
| TC-CS35-07 | Boundary — equal times versus one-minute duration | Venue Staff authenticated; block form open | Submit `endAt == startAt`, then repeat with end one minute later | Equal: `10:00`–`10:00`; valid: `10:00`–`10:01`, same venue/time zone | Equal times rejected with field guidance and no persistence; one-minute interval accepted, shown on calendar, and present after refresh | Frontend + BFF/API integration | 2026-10-04 16:33:00 |

## Block boundary

The page uses `useFetch('/api/bookings/availability')` for reads and
`$fetch('/api/bookings')` for block/booking mutations. `status=BLOCKED` must be
preserved across the BFF boundary; the UI must not normalize it to another
status. Authorization is asserted at the BFF/service boundary, not only by
hiding a button. A client warning is not evidence that the service rejected a
request.
