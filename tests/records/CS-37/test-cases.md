# CS-37 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS37-30 covers persisted deadline and immediate expiry. Preconditions and steps: Real hold; advance only its deadline in isolated booking_db; Staff attempts approval; Coordinator refreshes. Expected result: Deadline visible, expired approval409, UI expired, original saved hold retained without scheduler. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-37](https://spmg8.atlassian.net/browse/CS-37), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment, reconciled 14 October 2026: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Session 3 and the later PO buffer direction are recorded in CS-76/77 and the [policy register](../../../docs/venue-policy-decisions.md). Team policies 3–6 are agreed. Q2 follow-up, 17 October: Coordinator tentative request → Staff approval confirms that venue booking; no additional Coordinator confirmation action. Parent Event confirmation remains separate. The original case creation dates remain unchanged; dated execution records retain their actual assertions/results.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS37-01 | Submit a booking request (SB AC1 (+W7); SB-01 (New W7)) | E1 APPROVED (C1) | 1) POST /events/E1/venue-bookings as C1; V1, D 10:00–12:00, 200, THEATRE | 201; PENDING_VENUE_REVIEW; 09:30–12:45 TENTATIVE; hold has expiry; A1 assertEqual(res.status_code, 201) A2 assertEqual(b.status, "PENDING_VENUE_REVIEW") A3 assertEqual(status_at("V1",("09:30","12:45")), "TENTATIVE") A4 assertIsNotNone(db.hold_for(b.id).expires_at) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-02 | Second venue for the same event (SB AC5 (+W7); SB-02 (New W7)) | SB-01 state | 1) POST booking for V2; V2, same time | 201; 2 bookings; A1 assertEqual(res.status_code, 201) A2 assertEqual(len(db.bookings(event="E1")), 2) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-03 | Request from results, then view (SB AC2; SB-03 (New W7)) | C1 on search results | 1) Click Request on V1 2) Open the booking; — | Pending with countdown; A1 assertEqual(page.inner_text("#status"), "Pending") A2 assertTrue(page.locator("#countdown").is_visible()) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS37-04 | Non-assigned Coordinator (SB AC1; SB-04) | E1 (C1) | 1) POST booking as C2; — | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-05 | Event not yet approved (SB AC4; SB-05) | E1 UNDER_REVIEW | 1) POST booking as C1; — | 409; A1 assertEqual(res.status_code, 409) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-06 | Missing start time (SB AC3; SB-06) | E1 APPROVED | 1) POST booking; start null | 400 start flagged; A1 assertIn("start", res.json()["fieldErrors"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-07 | Same venue overlapping on one event (SB AC5 (+W7); SB-07 (New W7)) | SB-01 state | 1) POST V1 11:00–13:00; — | 409 DUPLICATE_VENUE; A1 assertEqual(res.json()["code"], "DUPLICATE_VENUE") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-08 | Venue blocked in window (SB AC1; SB-08) | block 09:00–09:45 at V1 | 1) POST V1 10:00–12:00; — | 409 BLOCKED; A1 assertEqual(res.json()["reason"], "BLOCKED") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-09 | Many venues on one event (SB AC5 (+W7); SB-09 (New W7)) | E1 APPROVED; V1–V5 free | 1) POST 5 bookings in turn; V1–V5 | All 201; A1 assertEqual([r.status_code for r in rs], [201]*5) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-10 | Booking request creates a hold with default expiry (AC1, AC2) | seed_base; E1 APPROVED, event in 10 days; clock 2026-10-12 09:00 | • POST /events/E1/venue-bookings as C1; V1, D 10:00–12:00 | Hold created; expires 2026-10-15 09:00; A1 assertIsNotNone(h) A2 assertEqual(h.expires_at, clock.now() + timedelta(hours=72)) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-11 | Venue Staff extend a hold (AC4) | TC-CS37-10 state | • POST /holds/H1/extend as VS1; hours 24 | Expiry +24 h; history HOLD_EXTENDED; A1 assertEqual(db.hold("H1").expires_at, old + timedelta(hours=24)) A2 assertEqual(db.history("E1")[0].type, "HOLD_EXTENDED") | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-12 | Coordinator sees time remaining (AC5) | TC-CS37-10 state; C1 logged in | • Open booking B1 2) Hover V1 calendar slot; — | Countdown "72h 00m"; tooltip shows expiry; A1 assertEqual(page.inner_text("#countdown"), "72h 00m") A2 assertIn("15 Oct 09:00", page.inner_text(".tooltip")) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS37-13 | Coordinator cannot extend (AC4) | TC-CS37-10 state | • POST /holds/H1/extend as C1; hours 24 | 403; expiry unchanged; A1 assertEqual(res.status_code, 403) A2 assertEqual(db.hold("H1").expires_at, old) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-14 | Omitted deadline defaults; explicit invalid/past deadline rejected (AC1, AC3; reconciled 14 October) | seed_base; current assigned Coordinator; Planning Event; eligible venue; controlled clock | 1) POST /venue-bookings without expiresAt 2) supply null/malformed expiresAt 3) supply now−1h | Omitted deadline returns201 with persisted min(now+72h,setupStart); supplied invalid or past deadline returns422 with error.fields.expiresAt and no booking/activity/intent mutation. Repeat default with setup sooner than 72h. Original rejection-of-omission proposal retained below as superseded. | Happy/negative/boundary · Real HTTP | 2026-10-12T19:13:47+08:00 |
| TC-CS37-15 | A hold isn't a confirmed booking (AC6) | TC-CS37-10 state (B1 pending, held) | • POST /events/E1/confirm as C1; — | 409; B1 outstanding; A1 assertEqual(res.status_code, 409) A2 assertIn("B1", res.json()["outstanding"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-16 | Default capped at event start (AC2, AC3) | clock T; occupied window starts T + 47 h, T + 72 h, T + 73 h (3 events) | • Create a booking request for each; — | Expiry T + 47 h, T + 72 h, T + 72 h; A1 assertEqual(exp_47, T + timedelta(hours=47)) A2 assertEqual(exp_72, T + timedelta(hours=72)) A3 assertEqual(exp_73, T + timedelta(hours=72)) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS37-17 | Hold shows expiry (CS-34 AC1 (+W7); 34-07 (New)) | H1 expires T + 24 h | 1) GET calendar; — | TENTATIVE with expiresAt; A1 assertEqual(seg("H1")["status"], "TENTATIVE") A2 assertEqual(seg("H1")["expiresAt"], iso(T + timedelta(hours=24))) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |

## Q2 confirmation policy — 17 October 2026

Coordinator request creates the soft hold. Venue Staff approval is the second
action and confirms only that booking; no additional Coordinator confirmation
button is required. TC-CS38-01/23/30 verify the request/decision sequence,
readiness metadata, immutable activity and unchanged Planning Event across
HTTP, PostgreSQL and desktop/mobile browser layers. Creation alone still has
an expiry and never satisfies confirmed-venue readiness. Historical runs below
retain their actual execution dates and assertions.

## Superseded source expectation — reconciled 14 October 2026

Under Aryan's authorization to settle internal PO/team decisions, TC-CS37-14 now distinguishes an omitted deadline from a caller-supplied invalid deadline. Omission uses the agreed 72-hour default capped at setup start; explicit null, malformed or past values are rejected. The current Booking contract uses422 and error.fields, not the old illustrative 400/fieldErrors shape. This aligns the case with TC-CS37-10/16 and the live service; it was independent of the Q2 clarification subsequently recorded on 17 October.

Original TC-CS37-14 proposal: “Missing or past expiry rejected”; steps “POST /venues/V1/holds without expiry 2) with past expiry; expiresAt null; now − 1 h”; expected “400 both; A1 assertEqual(r1.status_code, 400) A2 assertIn("expiresAt", r1.json()["fieldErrors"]) A3 assertEqual(r2.status_code, 400)”. It is retained here as superseded, not deleted from the source. Historical execution records are unchanged and must not be relabelled as Pass for the new cases.

TC-CS37-15's whole-Event confirmation step still requires CS-31/42/Safety contracts and is not proved by venue readiness alone.

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS37-18 | Expiry during PostgreSQL lock wait | Active persisted hold; another transaction retains its venue lock | Start approval, wait across deadline, release the lock | 409 HOLD_EXPIRED using current database clock; original hold/activity preserved | Real HTTP / PostgreSQL | 2026-10-12T19:13:47+08:00 |
| TC-CS37-19 | Atomic request intent and rollback | Eligible Planning Event/room; PostgreSQL intent trigger rejects insert | Create a hold; separately reject its outbox insert | One hold/activity/request intent on success; all three roll back on failure | HTTP / memory and PostgreSQL | 2026-10-12T19:13:47+08:00 |
| TC-CS37-20 | Non-Planning Event guard | Approved request with parent Event outside Planning | Request a room | 409; no hold/history/intent | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-21 | Atomic room move and independent preservation | Two independent holds; target occupied or eligible | Attempt a rejected move, then an eligible move | Rejected move preserves both; successful move releases only old room and retains sibling | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-22 | Setup must fit opening hours | Advertised time fits but setup starts before opening | Request the room | 422; no hold saved | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-23 | Malformed or forbidden overrides | Eligible Event and venue | Submit wrong requirement types, optional marker, caller buffer override and offsetless instant | Field422 without a booking | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-24 | Preserve an approved extension during title edit | Staff extends an active hold | Coordinator edits title with current version | Same extended deadline retained; valid versioned audit | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-25 | Expired hold and catalogue deletion | Persisted hold at exact deadline | Delete otherwise unused venue | Deletion allowed; original booking/history retained | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS37-26 | Calendar deadline without navigation | Fetched active hold; component clock crosses its deadline | Advance time without refetch/navigation | Hold disappears at deadline; no audit mutation | Nuxt component | 2026-10-12T19:13:47+08:00 |

## Team policy agreement — 14 October 2026

TC-CS37-26: Staff cannot extend without the current Coordinator's recorded request. One approval adds at most 24 hours to the current deadline, never past setup. Request does not extend occupancy; acceptance increments the count and preserves history/outbox atomically.

TC-CS37-27: Reject over-limit, unauthorized, stale and expired extension requests with no hold mutation.

Existing TC-CS37-11/24 now require the preceding Coordinator request, following the newly agreed policy.

TC-CS37-28: A hold created within 24 hours of its capped deadline queues one immediate Coordinator warning intent; idempotent replay does not duplicate it. This verifies durable intent, not message delivery.

TC-CS37-29: Real PostgreSQL HTTP request survives service reconnect; simultaneous Staff approvals yield one success and one stale conflict, one immutable extension activity and one outbox intent. The consumed limit survives reconnect.

TC-CS37-30: A valid authenticated dual Coordinator/Staff actor who is not assigned to the Event receives 403 when requesting an extension; the existing request, version, activity and outbox remain unchanged.

TC-CS37-31: Re-requesting a rejected room into a short active hold queues an immediate warning for the new version. Deadline-shortening edits receive the same rule; ordinary title edits do not create duplicate warnings.


## 17 October final evidence audit

| Test Case ID | Acceptance proof | Execution layer | Date of Creation |
|---|---|---|---|
| TC-CS37-33 | Changing an existing hold's time into a conflicting commitment returns409 VENUE_CONFLICT; both bookings, histories and outbox entries remain unchanged. | Actual service HTTP with isolated repositories. | 2026-10-17 |
