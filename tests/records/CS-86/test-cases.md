# CS-86 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS86-30 covers automatic initial rollout and restart. Preconditions and steps: Two inherited approvals, simulated legacy45-minute buffers with service stopped; restart and await persisted receipt. Expected result: Both approved records flagged automatically; service actor recorded; completed receipt and booking versions unchanged after restart. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

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


Execution boundary at 12 October (preceding phase): the automated TC-CS86-01 slice proves preserved approvals, both-sided flags, current windows, flag clearing and deduplicated durable intent. It does not prove the source row's Coordinator inbox notices or the separate two-booking resolution pane; CS-50/51 delivery and those UI steps remain unexecuted.

## 13 October 2026 continuation cases

Date of Creation: 2026-10-13T17:31:06+08:00. Original source IDs and assertions above are preserved. Results below require their named layer; component/intent proof does not establish inbox delivery or human acceptance.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS86-08 | AC1/2/3/6: authoritative conflict report | Two approved future bookings become overlapping after a buffer increase; worker not run | Staff reads conflicts; Coordinator and Technical Support attempt the same read | Both commitments/windows/current assignment visible to Staff; no mutation; other roles403 | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |
| TC-CS86-09 | AC1/2/4/6: initial rollout recheck | Current venue version and two inherited approvals | Staff posts recheck with reason; repeat; try stale version, missing reason and Coordinator | Atomic flags/history/intent with authenticated actor; no duplicate actions; stale409, invalid422, forbidden403 | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |
| TC-CS86-10 | AC3/6: retired venue history | A rejected booking whose venue was removed plus a current inherited conflict | Read all conflicts | Retired history does not prevent current conflict review | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |
| TC-CS86-11 | AC3: role-aware Staff workspace | Primary Coordinator plus authorized secondary Venue Staff; separate Technical Support fixture | Mount actual workspace for each role set | Staff tools available only with Venue Staff role and decision capability | Nuxt component | 2026-10-13T17:31:06+08:00 |
| TC-CS86-12 | AC2/3/6: legacy missing Event | Imported confirmed commitment with unresolved logical Event reference | Read conflict report and perform authorized recheck | Commitment/history retained; EVENT_NOT_FOUND flag; no invented Coordinator or Event; other valid bookings still rechecked | Real HTTP boundary | 2026-10-13T17:31:06+08:00 |
| TC-CS86-13 | AC1/5/6: slow dependency crosses expiry | Active hold and inherited operational closure; delayed Event context | Run recheck while clock crosses hold deadline | Expired hold excluded, unchanged, and no conflict notice intent for it | Real HTTP boundary with delayed dependency | 2026-10-13T17:31:06+08:00 |
| TC-CS86-14 | AC1/2/3/6: PostgreSQL report/recheck | Real migrated booking_test; two inherited approved records; current Venue/Event contract fixtures | Read report then recheck twice | Read makes no writes; approvals retained; flags persisted; repeated recheck adds no history/intent | PostgreSQL HTTP integration | 2026-10-13T17:31:06+08:00 |
| TC-CS86-15 | AC2/6: PostgreSQL atomic rollback | TC-CS86-14 fixture; temporary rejecting outbox trigger | Recheck, observe failure, remove trigger and retry | All booking/history/outbox changes roll back together; retry updates both records once | PostgreSQL HTTP integration | 2026-10-13T17:31:06+08:00 |

TC-CS86-03 now also exercises the actual two-pane Staff workspace and live desktop/mobile comparison. TC-CS86-05/06/07 retain their original meaning and now have explicit past-record, protected-deletion and 44/45/46-minute HTTP checks. The 45-minute adjacency fixture explicitly selects the working allow-touching policy; Q3 remains Pending. Early continuation diagnostics briefly reused labels 07/08 for the new report/recheck probes; their evidence is reconciled to 08/09 without changing assertion outcomes or timestamps. Original raw reports remain outside Git.

## 13 October independent-audit regression cases

The cases below preserve current scope and original source assertions. Date of Creation: 2026-10-13T18:49:21+08:00.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS86-16 | AC1/2/3/5: occupied end boundary | A ends04:00, turnaround to04:45; B starts04:15; both flagged | At04:05 read report then recheck | Both panes/flags retained through current turnaround; no clearing intent or audit churn | Real HTTP boundary with controlled clock | 2026-10-13T18:49:21+08:00 |
| TC-CS86-17 | AC3/6: secondary Staff calendar | Primary Coordinator, authorized secondary Venue Staff and decision capability | Open operational window in actual workspace, fill reason/title, submit to registered Nitro endpoint | Only BLOCKED/UNAVAILABLE creation; authenticated workspace sends operational body without ordinary Event requirement | Nuxt component and Nitro transport fixture | 2026-10-13T18:49:21+08:00 |
| TC-CS86-18 | AC2/3/6: guarded Staff edits | Current confirmed booking and separate operational block | Open each in actual Staff calendar | Confirmed arrangement read-only; operational edit offers only BLOCKED/UNAVAILABLE/CANCELLED | Nuxt component | 2026-10-13T18:49:21+08:00 |

Current execution boundary: both panes, current occupied windows, protected deletion and audited rollout recheck now have component and live-browser scenarios. Desktop/mobile outcomes are in the dated browser evidence. Durable notice intent is verified; actual Coordinator inbox delivery remains blocked by CS-50/51.

## 13 October read projection race cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS86-20 | AC1/3/6: expiry/removal while report waits | Active hold preselects venue; lock acquisition paused | At deadline delete unoccupied venue, resume unfiltered report | 200 empty result, no mutation; explicit unknown venue still404 | 2026-10-13T19:07:55+08:00 |
| TC-CS86-21 | AC1/3/6: expiry/removal while availability waits | Active hold snapshot; Venue context request paused | At exact deadline delete venue, resume lookup | Fresh clock excludes now-ineffective hold;200 empty, no booking/history rewrite | 2026-10-13T19:07:55+08:00 |

## 13 October initial rollout automation

Date of Creation: 2026-10-13T20:39:13+08:00. These cases exercise the production worker and real Venue/Booking/Event HTTP handlers. Notification assertions cover durable intent only; CS-50/51 inbox delivery remains pending.

| Test Case ID | Scenario / AC | Preconditions and steps | Expected result | Layer |
| --- | --- | --- | --- | --- |
| TC-CS86-22 | AC1/2/6: automatic initial rollout | Two inherited approved commitments conflict under current buffers; no configuration-change intent. Drain and repeat. | Both flags persist, approvals/catalogue remain, explicit service actor, one durable rollout and no duplicate history/intent | Real HTTP and production worker |
| TC-CS86-23 | AC1/6: dependency failure and retry | Initial rollout; Booking service returns503, then recovers | Pending intent/error survive; same action retries, succeeds once and preserves approvals | Real HTTP and production worker |
| TC-CS86-24 | AC1/2: catalogue seeded after startup | Drain an empty catalogue; then add inherited commitments and drain again | New venue receives its one-time rollout; existing bookings remain approved | Real HTTP and production worker |
| TC-CS86-25 | AC1/6: concurrent discovery and restart | Two discovery calls on migrated venue_test; disconnect/reconnect | One persisted receipt per venue; stable ID/version/payload; no catalogue/history mutation | PostgreSQL production store |
| TC-CS86-26 | AC1/2/6: configuration race and completed restart | Discover rollout, change buffer version, drain and reconnect | Worker accepts acknowledged newer version; original receipt retained; no completed replay | PostgreSQL store/worker with explicit Booking acknowledgement fixture |
| TC-CS86-27 | AC1/6: failure isolation | 22 imported venues; one Booking response fails; drain bounded batches | All 21 healthy venues finish; failed intent remains retryable | PostgreSQL store/worker with explicit Booking failure fixture |

Initial-rollout fixtures remove the atomic new-Venue empty-catalogue completion proof to represent a legacy/imported catalogue. A newly created API Venue is already configured and has no inherited commitments; its first configuration edit retains the existing single-action retry contract (TC-CS84-15). Rollout receipts use completion time/reason, distinct from actual configuration or inbox message delivery.
