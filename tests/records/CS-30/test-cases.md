# CS-30 — Test Case Specification (IS212 / IEEE 829)

> Blue section — written once. Execution results are retained with the test run's workflow artifacts.
>
> Phase A scope (organiser-visible slice): mock assignment on submit, owner-only reads, coordinator banner, reusable edit form. Out of scope for this card: load/availability selection rule, reassignment endpoint + rights swap, competing-attempt guards, CS-50 verified receipt, activity writes (tracked as Phase B).

Story: *As an Event Organiser, I want a single responsible Coordinator for my submitted event so that I have a clear point of contact throughout planning.*

| Test Case ID | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Date of Creation |
|---|---|---|---|---|---|---|
| TC-CS30-01 | Owning organiser reads the submitted request with its current coordinator; unrelated users denied | Submitted request with assignment; Organiser A (owner) and Organiser B authenticated | 1. A reads `GET /api/events/:id` 2. B reads the same ID directly 3. Read `GET /api/users/:coordinatorId` | Existing submitted request ID | A receives fields + `coordinatorId`; B receives `403` without contents; users endpoint returns BFF profile view (`id, email, name, role`, never `passwordHash`) | 2026-09-20 11:00:00 |
| TC-CS30-02 | Organiser sees the current coordinator contact on the confirmed page | Submitted request with `coordinatorId`; coordinator profile reachable | 1. Open `/requests/:id` | Submitted request ID | Banner below the heading shows coordinator name and email; no banner when unassigned | 2026-09-20 11:00:00 |
| TC-CS30-03 | Submitted request is read-only; its owner may edit a Returned request | Submitted and Returned requests owned by the organiser | 1. Open Submitted request and verify no Edit action 2. Open Returned request 3. Choose Edit, change name and Save | Changed event name | Submitted fields remain locked; Returned save issues one `PUT`, refreshes both Coordinator contact and dashboard data, and restores read-only detail | 2026-09-20 11:00:00 |
| TC-CS30-04 | Draft opens editable and submits the same request | Draft request owned by the organiser | 1. Open `/requests/:id` (fields enabled) 2. Complete required fields and Submit | Draft request ID | Submit issues `PUT` with `submit: true`; same ID becomes `SUBMITTED`/Under Review; detail is read-only and the assigned Coordinator appears without a reload | 2026-09-20 11:00:00 |
| TC-CS30-05 | Unavailable request shows an error state | No session / unknown ID | 1. Open `/requests/:id` without access | Unknown ID or no cookie | Error state shown, no request contents rendered | 2026-09-20 11:00:00 |
| TC-CS30-06 | Coordinator-only review queue endpoint | Coordinator / organiser / anonymous | 1. `GET /api/review-queue` per actor | Session per role | Coordinator gets submitted requests with organiser contact; organiser 403; anonymous 401 | 2026-09-20 14:30:00 |
| TC-CS30-07 | Coordinator decision transitions | Submitted / decided / unknown request; coordinator / organiser | 1. `POST /api/events/:id/decision` per case | approve / reject / amendments / bogus | approve→APPROVED, reject→REJECTED, amendments→RETURNED_FOR_AMENDMENT; organiser 403; bogus 422; unknown 404; non-submitted 409 | 2026-09-20 14:30:00 |
| TC-CS30-08 | Role scoping on reads | Coordinator / other organiser | 1. `GET /api/events` per role 2. `GET /api/events/:id` as assignee | Coordinator + organiser sessions | Coordinator list empty (queue owns them); organisers see only own; assignee reads submitted details, drafts stay owner-only | 2026-09-20 14:30:00 |
| TC-CS30-09 | Homepage renders per role | Coordinator / organiser session | 1. Open `/` per role | Session per role | Coordinator sees Review queue (not Your events); organiser keeps dashboard | 2026-09-20 14:30:00 |
| TC-CS30-10 | Queue selection and detail | Queue with 2 items | 1. Open `/` as coordinator 2. Click second item | Two submitted fixtures | First selected by default (`aria-current`); click switches details | 2026-09-20 14:30:00 |
| TC-CS30-11 | Decision actions from the queue | Queue item selected | 1. Click Approve / Reject | Success then 409 failure | Decision posts, queue refreshes; failure shows alert, queue intact | 2026-09-20 14:30:00 |

*RBAC note: reads are owner-scoped server-side (`organiserId` vs session user). At most one current coordinator per request (single non-revoked assignment row).*

*Review queue 2026-09-20 (Figma `coordinator-review-shadcn`): homepage renders per role (middleware + BFF enforce; page falls through to dashboard for unknown roles only because the middleware guarantees members). Frame deviations, all deliberate: navbar kept as the shared app nav (Events selected) instead of the frame's Review-queue/All-events variant; queue badges read Stored-status labels (`Submitted`) rather than the frame's "Under review"; "Search venues →" and "Send to Technical Support →" omitted (downstream venue/tech flows, other stories); "Assign to me" omitted (navbar stays shared; assignment is automatic in the mock). Venue/equipment values render from record data; equipment rows cover the shared option list with Requested/Not requested.*

*Decided rows leave at once 2026-09-20: after a successful decision the row is removed locally immediately (selection advances) and `refreshNuxtData('coordinator-queue')` reconciles with the server — the list never shows decided records, even if a refresh races.*

*Seed bridge 2026-09-20: dashboard seed rows predate the request store, so `GET /api/events/:id` materializes them on first read as organiser-owned (`u-organiser`) records — every listed card opens; other organisers still get 403. Dashboard cards link via stretched-link; View details is a real link to the same destination.*

*Seed data 2026-09-20: seeds are complete records (same shape the BFF persists; deterministic timestamps) and the dashboard `meta` line is derived from record data (`date · venue · capacity`), so homepage, detail reads and the edit form prepopulate from one source. Seeded assignments exist for submitted/approved/returned rows.*

*Live list 2026-09-20: the dashboard list was a static import-time snapshot, so PUT edits and POST creates never showed. `GET /api/events` now derives rows live from the store (seeds overlaid with writes + created records); dashboard cards update after save without a reload.*

*Change-coordinator affordance 2026-09-20: disabled "Change coordinator" action sits left of Reject (order covered by test). Intentionally unbound — reassignment endpoint + rights swap belong to the backend team; enabling it is a future slice.*

## Source-based amendments — 2026-10-06

This branch replaces seeded mock IDs/empty-router assumptions with migrated PostgreSQL fixtures through the real BFF handlers. Submitted UI stays read-only per current CS-11; Returned remains editable for its owner. Coordinator visibility is assigned-only and draft privacy is mandatory under the current full request. Change Coordinator remains unavailable because reassignment is not built here. Existing TC descriptions/earlier runs remain for traceability; new execution records show missing old IDs as Not Executed.

Aryan selected least-recently-assigned fairness for equal workloads during this implementation. Existing creation-time cases now apply when **all tied Coordinators have no assignment history**, or equal latest-assignment timestamps. The shared selector still prioritises active workload. New unit and actual HTTP/PG cases test never-assigned priority, closed/revoked assignment history, rotation and eight simultaneous distinct submissions. Javier must review this shared-policy extension.

### Verification correction — 2026-10-07

TC-CS30-03/04 follow current CS-11 read-only and same-request draft-submission criteria. The old scalar dashboard-refresh assertion omitted the Coordinator contact refresh needed to show the assignment immediately. It now strictly requires both `event-coordinator-req-1` and `organiser-events`; save-count, payload and read-only assertions remain. The reproduced 104/105 failed run is retained, followed by a new dated result. Earlier execution records remain historical evidence.
