# CS-85 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-08T15:59:21Z (23:59:21 Singapore time).

Story: As an Event Coordinator, I want venue availability and conflict checks to include each venue's setup and turnaround time so that the room can be prepared and reset safely.

Source: [CS-85](https://spmg8.atlassian.net/browse/CS-85), Week 7 change 1 and the preserved PM case mapping. The source cases remain release requirements; the first branch change implements only the independent calculation and overlap primitives. Its domain-unit results do not establish API, persistence, authorization, calendar or browser acceptance.

| Test Case ID | Scenario | Pre-conditions | Test Steps / Test Data | Expected Result | Automation layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS85-01 | Customer worked example, AC1/4 | Pure function; explicit venue durations | Expand 10:00–12:00 +08:00 with setup 30 and turnaround 45 | 09:30–12:45 +08:00, normalized to UTC | Domain unit | 2026-10-08T15:59:21Z |
| TC-CS85-02 | Venue free after turnaround, AC2 | Booking 10:00–12:00; venue setup 30/turnaround 45; authorized search | Search 13:30–15:00 | Venue returned: candidate occupied start 13:00 is after 12:45 | Search/API integration; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-03 | Calendar buffer shading, AC5 | Approved booking and authorized Coordinator | Open calendar and hover 10:00–12:00 | Event block plus setup 09:30–10:00 and turnaround 12:00–12:45 shading | UI/browser; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-04 | Search, calendar and booking agreement, AC2 | Approved 10:00–12:00 booking with buffers | Search 13:00–14:00; inspect calendar; submit the booking | All reject occupied 12:30–14:45 overlapping 12:45 | Cross-feature integration; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-05 | Setup clashes with turnaround, AC2/3 | Existing approved booking and authorized actor | Submit 13:00–14:00 at that venue with setup 30 | 409 identifies the existing commitment; no new booking | Booking HTTP/persistence; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-06 | Setup overlaps an operational block, AC2 | Block 09:00–09:45 at venue | Submit advertised 10:00–12:00 with setup 30 | Rejected as blocked; no new booking | Booking HTTP/persistence; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-07 | Touching versus overlapping occupied windows, AC3 | Explicit boundary policy passed to pure comparator | Compare 09:30–12:45 with starts at 12:44, 12:45 and 12:46; check both policy choices | With touching permitted: true, false, false; equality conflicts when touching is forbidden | Domain unit; Q3 policy remains pending | 2026-10-08T15:59:21Z |
| TC-CS85-08 | Booking and block calendar display | Approved booking and operational block | Read calendar | Correct statuses and venue buffer display | Calendar integration; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-09 | Zero versus nonzero turnaround and midnight calendar span | Two venues with different buffers and overnight booking | Read both calendars across midnight | Per-venue overlap and both-day display are correct | Calendar integration; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-10 | Hover shows advertised and occupied times, AC5 | Approved booking; Coordinator on calendar | Hover booking | Both 10:00–12:00 and 09:30–12:45 shown | UI/browser; not implemented by this foundation | 2026-10-08T15:59:21Z |
| TC-CS85-11 | Derived domain guard: invalid minute inputs, CS-84 AC2 / CS-85 AC1 | Explicit venue buffers supplied | Test negative, fractional, string, null, missing, non-finite and unsafe integers separately on each field | Reject with the individual field name; no coercion | Domain unit; not CS-84 persistence/HTTP evidence | 2026-10-08T15:59:21Z |
| TC-CS85-12 | Derived domain guard: invalid or ambiguous intervals, CS-85 AC1 | Millisecond ISO-instant domain input | Test missing/invalid/offsetless/impossible dates, sub-millisecond precision and equal/reversed instants | Reject with startAt/endAt; no timezone-dependent calculation, silent calendar rollover or precision truncation | Domain unit | 2026-10-08T15:59:21Z |
| TC-CS85-13 | Derived domain guard: arithmetic outside representable instants, CS-85 AC1 | Positive ordered booking; explicit integer durations | Expand each side with Number.MAX_SAFE_INTEGER minutes | Reject an unrepresentable occupied window | Domain unit; not an approved business buffer cap | 2026-10-08T15:59:21Z |

## Integration boundary

The domain inputs are explicit ISO instants and explicit non-negative whole-minute venue durations. They do not select a default or the proposed 480-minute business maximum, read a venue, persist bookings, enforce per-venue transactions, extend equipment reservations, interpret operating hours or expire holds. Those choices and adapters belong to CS-84/77/78/39 and their consumers.

CS-77 remains the shared design prerequisite, CS-84 supplies the persisted settings, and Q3 supplies the final touching policy. Keep calculation reusable; integrate it into all search/calendar/submission/approval/block paths under CS-85 before claiming the whole story delivered. CS-39 owns atomic conflict enforcement. Source API/UI cases remain Not Executed until their actual boundaries exist and pass.
