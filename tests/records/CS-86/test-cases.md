# CS-86 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-86](https://spmg8.atlassian.net/browse/CS-86), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS86-01 | Raising turnaround flags existing clashes (AC1, AC2, AC3) | seed_base; V3 (0/0) with B1 10:00–12:00 and B2 12:15–14:00, both APPROVED | PUT /venues/V3 as VS1 2) Run re-check job; turnaroundMin 45 | Both flagged BUFFER_CONFLICT; still APPROVED; both Coordinators notified; A1 assertIn("BUFFER_CONFLICT", db.booking("B1").flags) A2 assertIn("BUFFER_CONFLICT", db.booking("B2").flags) A3 assertEqual(db.booking("B1").status, "APPROVED") A4 assertEqual(notify.count(type="BUFFER_CONFLICT"), 2) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS86-02 | Flags clear when the clash is resolved (AC4) | TC-CS86-01 state | PUT /venues/V3 turnaround 15 2) Run re-check; turnaroundMin 15 | Flags removed; A1 assertListEqual(db.booking("B1").flags, []) A2 assertListEqual(db.booking("B2").flags, []) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS86-03 | Venue Staff review a clash (AC3) | TC-CS86-01 state; VS1 logged in | Open Buffer conflicts 2) Click B1/B2 row; — | Both bookings side by side with windows; A1 assertEqual(page.locator(".conflict-pane").count(), 2) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS86-04 | Internal flag hidden from the Organiser (AC2) | TC-CS86-01 state; B1 belongs to O1's E1 | GET /events/E1 as O1; — | No flags field; A1 assertNotIn("flags", res.json()["venueBookings"][0]) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS86-05 | Past bookings ignored (AC5) | seed_base; B_past ended yesterday overlapping B_x under new buffer | Change turnaround 2) Run re-check; — | B_past not flagged; A1 assertListEqual(db.booking("B_past").flags, []) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS86-06 | Flagged booking can't be deleted from the list (AC2) | TC-CS86-01 state | DELETE /venue-bookings/B1 as VS1; — | 403/405; booking remains; A1 assertIn(res.status_code, (403, 405)) A2 assertIsNotNone(db.booking("B1")) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS86-07 | Gap vs turnaround 45 (setup 0) (AC1) | V3 turnaround 45; pairs with gaps of 44, 45, 46 min | Run re-check; gaps 44, 45, 46 | 44 flagged; 45, 46 not; A1 assertIn("BUFFER_CONFLICT", flags(gap=44)) A2 assertNotIn("BUFFER_CONFLICT", flags(gap=45)) A3 assertNotIn("BUFFER_CONFLICT", flags(gap=46)) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |


Execution boundary: the automated TC-CS86-01 slice proves preserved approvals, both-sided flags, current windows, flag clearing and deduplicated durable intent. It does not prove the source row's Coordinator inbox notices or the separate two-booking resolution pane; CS-50/51 delivery and those UI steps remain unexecuted.
