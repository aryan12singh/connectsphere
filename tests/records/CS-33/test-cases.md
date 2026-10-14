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

## Sprint 3 reviewer regression additions — 14 October 2026

These cases cover the current authorized venue catalogue UI/API. Component results and actual browser/database results are recorded separately; neither layer records human acceptance. The original source cases and dated execution records above remain historical.

| Test Case ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CS33-12 | Reject an invalid IANA time zone atomically | Authorized Venue Staff; real HTTP venue routes and disposable catalogue | Submit an invalid zone on creation and replacement; reread venue/list/history; submit valid supported zones | `Asia/Singapor`; trimmed `Asia/Singapore`; UTC, America/New_York, Asia/Kolkata | Invalid input returns422 with time-zone guidance and creates/changes no venue or history; supported zones accepted and normalized | HTTP/memory; production BFF/database browser separately | 2026-10-14T11:39:00Z |
| TC-CS33-13 | Accessible time-zone correction guidance | Venue form has an entered invalid zone and server field errors | Read label/input/error association; correct or clear error state without replacing form data | `Asia/Singapor`; named time-zone message | Entered value retained; `aria-invalid` and `aria-describedby` identify the alert; clearing errors removes invalid association | Nuxt component; production browser separately | 2026-10-14T11:39:00Z |
| TC-CS33-14 | Actual bounded venue pagination and search/data changes | Authorized Staff workspace with13 rooms; independent selected-room calendar | Inspect six first-page cards; Next/Previous through3 pages; select room8; search, clear search, shrink list to8 and remove all rooms | Hall01–13; matching and unmatched queries | Actual cards change six per page; Previous/Next disabled at bounds; real Page X of Y; search resets to first page and list reduction clamps; no-results/empty-catalogue states explicit; selection and booking permissions retained until selected room is removed | Nuxt component; production desktop/mobile browser separately | 2026-10-14T11:39:00Z |
| TC-CS33-15 | Expand/collapse venue history with hydration and venue reset | Authorized current venue; five permitted history rows, then another venue or short/empty history | Inspect three recent rows; Show full history; Show recent history; switch venue; supply short/empty history; inspect server HTML | Five immutable history entries; one entry; no entries | Full action displays every returned permitted row and collapse restores three; `aria-expanded` and `aria-controls` identify state/list; expansion resets on venue switch; no redundant control for at most3 rows; empty state explicit; server button disabled until handlers attach | Nuxt component/SSR; production desktop/mobile browser separately | 2026-10-14T11:39:00Z |
