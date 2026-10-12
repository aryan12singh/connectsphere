# CS-87 — Test Case Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-87](https://spmg8.atlassian.net/browse/CS-87), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. Customer policy answers remain Pending in CS-76/77. Numeric caps, touching, duration/extensions and inclusive setup deadlines remain working settings, not approved requirements.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS87-01 | Four venues for one conference (AC1) | seed_base + fx_conf (E1 APPROVED, C1; V_aud cap 300, V_b1–V_b3 cap 40) | POST /events/E1/venue-bookings × 4 as C1; V_aud (200 ppl), V_b1–V_b3 (40 ppl each), D 10:00–12:00 | 4 × 201; 4 bookings linked to E1, each PENDING_VENUE_REVIEW; A1 assertEqual([r.status_code for r in rs], [201]*4) A2 assertEqual(len(db.bookings(event="E1")), 4) A3 assertEqual({b.status for b in db.bookings(event="E1")}, {"PENDING_VENUE_REVIEW"}) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS87-02 | Independent decisions per venue (AC1, AC6) | TC-CS87-01 state | VS1 approves 3 bookings 2) VS1 rejects V_b3 3) GET /events/E1; reason "Closed" | 3 APPROVED, 1 REJECTED; venueReady false; A1 assertEqual(statuses("E1").count("APPROVED"), 3) A2 assertEqual(statuses("E1").count("REJECTED"), 1) A3 assertFalse(res.json()["venueReady"]) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS87-03 | "Add another venue" from an event (AC5) | seed_base; E1 with 1 booking; C1 logged in | Open E1 2) Click Add another venue; — | Search pre-filled; existing booking listed; A1 assertEqual(page.input_value("#attendance"), "200") A2 assertEqual(page.locator(".existing-booking").count(), 1) | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS87-04 | Only the assigned Coordinator adds venues (AC1) | seed_base + fx_conf | POST /events/E1/venue-bookings as C2; V2 | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS87-05 | One unsuitable room doesn't block others (AC2, AC3) | TC-CS87-01 state | POST booking for V_b1 with attendance 60; V_b1, attendance 60 | 422 CAPACITY; other bookings unchanged; A1 assertEqual(res.status_code, 422) A2 assertEqual(res.json()["reason"], "CAPACITY") A3 assertEqual(statuses("E1"), before) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS87-06 | Same room twice for overlapping times (AC4) | seed_base; E1 has V_b1 14:00–15:00 | POST booking V_b1 14:30–15:30; V_b1, 14:30–15:30 | 409; still 1 booking for V_b1; A1 assertEqual(res.status_code, 409) A2 assertEqual(len(db.bookings(event="E1", venue="V_b1")), 1) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS87-07 | Venue-ready at n−1 vs n approvals (AC6) | TC-CS87-01 state | Approve 3 of 4, confirm 2) Approve 4th, read event; n = 4 | 3/4: venueReady false, confirm 409; 4/4: true; A1 assertFalse(ev_3["venueReady"]) A2 assertEqual(confirm_3.status_code, 409) A3 assertTrue(ev_4["venueReady"]) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS87-08 | Authoritative guarded planning projection | Distinct Event and approved source request | Read private planning context with valid and invalid keys | Current Event identity/assignment/needs; invalid key403; no shared database access | Real Event HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS87-09 | Virtual room compatibility | Virtual Event and venue; no physical capacity/layout | Request room | Independent tentative hold with VIRTUAL layout; no physical suitability false rejection | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS87-10 | Removed rejected venue remains auditable | Rejected room and catalogue removal | Read Event arrangements and explicitly release rejected room | Room remains visible/unready; explicit cancellation succeeds; no silent deletion | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS87-11 | Existing form/canonical catalogue compatibility | Lowercase layout/type, known form accessibility labels and unknown other need | Read summary and request an eligible room; try unknown need | Known labels map to catalogue codes; normal request201; unknown need remains unmet422 | Real Event/Venue/Booking HTTP / memory | 2026-10-12T19:13:47+08:00 |

| Test Case ID | Derived regression | Pre-conditions | Steps | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS87-12 | Room-action hydration safety | Assigned Planning Event in production/server-rendered HTML | Read without JavaScript; then mount normally and add another room | SSR Add/Refresh disabled; mounted click opens prefilled form without a lost click | Vue SSR/component; CS-87 also actual production browser | 2026-10-12T14:37:16+00:00 |
