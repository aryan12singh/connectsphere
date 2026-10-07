# CS-34 — Test Case Specification (IS212 / IEEE 829)

Story: *As an authorised ConnectSphere user, I want to view venue availability across calendar views so that bookings and availability blocks are represented accurately when planning an event.*

| Test Case ID | Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|
| TC-CS34-01 | Happy path — venue with one booking and one block | Authenticated user with venue visibility; selected venue has one ordinary booking and one `BLOCKED` interval in the visible range | Open the venue availability page and load the initial calendar range | Same venue; booking and block have distinct IDs and overlap the visible week | Both are rendered; booking and block use distinct labels, colours, or visual treatments; neither is omitted or merged | Frontend integration | 2026-10-04 16:33:00 |
| TC-CS34-02 | Happy path — add a block, then refresh | Venue Staff authenticated; venue calendar open; target interval empty | Create a valid block through the UI, wait for the BFF response, then refresh/re-fetch availability | Valid `BLOCKED` booking payload for the selected venue and interval | Block is persisted through the BFF and appears after refresh without duplicate rendering | Frontend + BFF integration | 2026-10-04 16:33:00 |
| TC-CS34-03 | Workflow — navigate to the next week and switch to day view | Calendar has data in the current and following week; user authenticated | Click **Next week**, verify the week, switch to day view, and move between days | Deterministic intervals in both ranges, including one crossing a day boundary | Each view requests and displays the correct range; stale intervals do not remain; day view preserves the selected day and interval details | Frontend + BFF integration | 2026-10-04 16:33:00 |
| TC-CS34-04 | Cross-cutting — coordinator views a booking | Existing booking with organiser/event data; authenticated Event Coordinator; auth permissions available | Open the availability calendar, select a booking, and inspect its details | Booking containing permitted and restricted fields | Coordinator sees only permitted details; restricted fields and venue-staff-only controls are absent | Frontend + BFF authorization integration | 2026-10-04 16:33:00 |
| TC-CS34-05 | Negative — availability end date precedes start date | Availability page/API client available; no valid range loaded for the attempted request | Request availability with `endAt` earlier than `startAt` and inspect response/page state | `startAt=2026-12-22T10:00:00Z`, `endAt=2026-12-22T09:00:00Z` | Standard error format; UI shows actionable range guidance and does not replace valid calendar data | Frontend + BFF/API integration | 2026-10-04 16:33:00 |
| TC-CS34-06 | Boundary — adjacent intervals and a midnight-spanning booking | Venue calendar open; deterministic boundary fixtures available | Load a booking ending at 10:00 with a block starting at 10:00; then load a booking spanning midnight | Adjacent: booking ends `10:00`, block starts `10:00`; second booking spans `23:30`–`01:00` | Adjacent intervals show back-to-back with no overlap flag; midnight booking appears on both dates with correct placement; no false conflict is reported | Frontend integration | 2026-10-04 16:33:00 |

## Availability boundary

The page uses `useFetch('/api/bookings/availability')` for reads and must not
call Kong or a service directly. Booking intervals with `status=BLOCKED` are
rendered as blocks. Conflict indication is client-side unless a later
approved requirement changes that rule.

## Sprint 2 regression additions

| Test Case ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Date of Creation |
|---|---|---|---|---|---|---|
| TC-CS34-07 | Early venue-local Monday | Singapore venue | Query day/week and read actual API/render component | local00:30–01:30; UTC previous16:30 | Booking retained in Monday day/week views | 2026-10-07 00:46:00 |
| TC-CS34-08 | Local midnight clipping | Interval spans Singapore midnight | Split in week; clip in day; exact midnight end | local23:30–01:00 | Correct civil dates; no extra midnight ending segment | 2026-10-07 00:46:00 |
| TC-CS34-09 | DST day duration | New York venue | Query spring/fall transition days | 2027-03-14 and2027-11-07 |23/25-hour UTC query intervals; one civil date | 2026-10-07 00:46:00 |
| TC-CS34-10 | Actual calendar and internal read-only access | Persisted early block; live Technical Support | Open week/day desktop/mobile | Monday00:30 local | Block visible; no write controls; APIs deny writes | 2026-10-07 00:49:00 |
| TC-CS34-11 | Incomplete datetime form | Venue Staff calendar | Open window form; clear start | Empty local time | Form survives with guidance and disabled Save | 2026-10-07 01:20:00 |
| TC-CS34-12 | Technical Support availability grant stays read-only | Migrated auth database and persisted booking | Read default grant and availability; attempt create/decision with injected capabilities | Technical Support identity, existing booking | venues.view granted; no default write grant; read200, create/decide403 even with injected capabilities | 2026-10-07T02:48:16+00:00 |
