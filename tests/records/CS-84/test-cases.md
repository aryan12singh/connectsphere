# CS-84 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS84-30 covers audited staff buffer form. Preconditions and steps: Save30/45 through real form with reason; inspect actual Venue row. Expected result: Version2, matching hours retained, actual buffers persisted. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-84](https://spmg8.atlassian.net/browse/CS-84), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Contract alignment, reconciled 14 October 2026: requests use the distinct Planning Event ID; pending venue status is `TENTATIVELY_HELD`, approval is `CONFIRMED` for that venue only. Validation uses422 `error.fields`; decisions/extensions carry the read version and reason. The [policy register](../../../docs/venue-policy-decisions.md) records Session 3, agreed team policies and the subsequent PO buffer direction. Buffers remain editable before the first confirmed venue booking; pre-policy existing venues have one initial configuration opportunity with recorded Staff → current Coordinator → Organiser communication. Only the Coordinator confirmation action remains pending customer clarification. Dated source/execution records remain historical.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS84-01 | Venue Staff set setup and turnaround (AC1) | seed_base; V2 at 0/0 | PUT /venues/V2 as VS1; setupMin 30, turnaroundMin 45 | 200; values stored; A1 assertEqual(res.status_code, 200) A2 assertEqual(db.venue("V2").setup_min, 30) A3 assertEqual(db.venue("V2").turnaround_min, 45) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-02 | Coordinator sees the updated setup time (AC4) | seed_base; VS1 and C1 browsers | VS1 edits V2 setup to 60, saves 2) C1 opens V2 from search results; setup 60 | C1 sees "Setup 60 min"; A1 assertEqual(page_c1.locator("#v2 .setup").inner_text(), "60 min") | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS84-03 | Coordinator cannot change buffers (AC4) | seed_base | PUT /venues/V2 as C1; setupMin 10 | 403; unchanged; A1 assertEqual(res.status_code, 403) A2 assertEqual(db.venue("V2").setup_min, 0) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-04 | Non-integer values rejected (invalid equivalence classes) (AC2, AC3) | seed_base | PUT setupMin "abc" 2) PUT setupMin 15.5; "abc"; 15.5 | 400 with setupMin flagged each time; A1 assertEqual(r1.status_code, 400) A2 assertIn("setupMin", r1.json()["fieldErrors"]) A3 assertEqual(r2.status_code, 400) A4 assertEqual(db.venue("V2").setup_min, 0) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-05 | Venues created before the change default to 0 (AC2) | migration applied to V_old | GET /venues/V_old as VS1; — | setup 0, turnaround 0; A1 assertEqual(res.json()["setupMin"], 0) A2 assertEqual(res.json()["turnaroundMin"], 0) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-06 | Lower and upper limits (placeholder max 480) (AC2) | seed_base | PUT setupMin for each value; −1, 0, 480, 481 | 400, 200, 200, 400; A1 assertEqual(put(-1).status_code, 400) A2 assertEqual(put(0).status_code, 200) A3 assertEqual(put(480).status_code, 200) A4 assertEqual(put(481).status_code, 400) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-07 | Create a venue with buffers (CS-33 AC1 (+W7); 33-01 (Updated)) | seed_base | 1) POST /venues as VS1; Hall A, location L1, capacity 300, layouts [THEATRE], setup 30, turnaround 45 | 201; all fields stored; A1 assertEqual(res.status_code, 201) A2 assertEqual(v.capacity, 300) A3 assertEqual((v.setup_min, v.turnaround_min), (30, 45)) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-08 | Edit visible to others immediately (CS-33 AC5; 33-02) | VS1 and C1 browsers | 1) VS1 sets V1 capacity 350, saves 2) C1 refreshes venue list; 350 | C1 sees 350; A1 assertEqual(page_c1.inner_text("#V1 .capacity"), "350") | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS84-09 | Coordinator edits a venue (CS-33 AC3; 33-03) | seed_base | 1) PUT /venues/V1 as C1; capacity 10 | 403; A1 assertEqual(res.status_code, 403) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-10 | Non-numeric capacity (CS-33 AC2; 33-04) | seed_base | 1) PUT /venues/V1 as VS1; capacity "abc" | 400 capacity flagged; A1 assertEqual(res.status_code, 400) A2 assertIn("capacity", res.json()["fieldErrors"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-11 | Delete a venue in use (CS-33 AC4; 33-05) | V1 has bookings | 1) DELETE /venues/V1 as VS1; — | 409; suggestion DEACTIVATE; A1 assertEqual(res.status_code, 409) A2 assertEqual(res.json()["suggestion"], "DEACTIVATE") | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-12 | Capacity limits (placeholder max 10,000) (CS-33 AC2; 33-06) | seed_base | 1) PUT capacity for each value; 0, 1, 10000, 10001 | 400, 200, 200, 400; A1 assertEqual(put(0).status_code, 400) A2 assertEqual(put(1).status_code, 200) A3 assertEqual(put(10000).status_code, 200) A4 assertEqual(put(10001).status_code, 400) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-13 | Buffers default to 0 (CS-33 AC1 (+W7); 33-07 (New)) | seed_base | 1) POST /venues without buffer fields; Hall B, L1, 100 | Both 0; A1 assertEqual(v.setup_min, 0) A2 assertEqual(v.turnaround_min, 0) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS84-14 | Buffer change triggers re-check (CS-33 AC1 (+W7); 33-08 (New)) | V3 with bookings | 1) PUT /venues/V3 turnaround 15 → 45 as VS1; 45 | 200; BUFFER_RECHECK job queued for V3; A1 assertEqual(res.status_code, 200) A2 assertIn(("BUFFER_RECHECK","V3"), jobs.enqueued()) | Workflow · Integration | 2026-10-12T19:13:47+08:00 |

Source numeric placeholders (480 buffer minutes and 10,000 capacity) remain configurable working limits. TC-CS84-05 requires migration evidence; a new compatibility create is recorded separately under13. The isolated legacy migration probe preserved IDs, hours and history, but is not a replacement for every source rollout case.

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS84-15 | Durable configuration recheck retry | Venue versioned edit; Booking initially unavailable | Let actual worker retry | Persist pending intent across failure, stable action ID, acknowledge matching/current version | Real HTTP running worker / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS84-16 | Deletion and in-flight commitment | Booking creation holds Venue commit lock | Attempt deletion while commitment finishes | Deletion waits, then409; committed booking retains its venue | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS84-17 | Virtual form nullable capacity | Virtual venue with empty physical capacity field | Serialize form | capacity null under existing API contract; no false zero | Form-state unit | 2026-10-12T19:13:47+08:00 |

## 13 October final recovery and concurrency cases

| Test Case ID | Scenario / AC | Pre-conditions | Steps | Expected result | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS84-18 | AC1/3/6: persistent removal fence | Real venue_test with current higher configuration version | Private DELETE with old/missing version | 409/422; catalogue, operating hours, immutable history and durable rechecks unchanged | 2026-10-13T19:02:26+08:00 |

## Session 3 audit regressions — 14 October 2026

Source: `docs/session3-decisions.md`, rows4/6/25/26. Old buffer-edit expectations after confirmation are superseded. These specifications do not imply execution or PO acceptance.

| Test ID | Scenario and expected behavior | Layer |
| --- | --- | --- |
| TC-CS84-31 | Real HTTP confirmation fences buffers; late buffer write409; unrelated maintenance succeeds | Memory service stack and live desktop/mobile |
| TC-CS84-32 | Concurrent PostgreSQL freeze/edit has one winner; retry is idempotent; reconnect retains fence; invalid late edit has no history write | Venue PostgreSQL HTTP |
| TC-CS84-33 | Lost freeze acknowledgement leaves booking held and venue frozen; refreshed retry confirms with one fence history | Fault-injected HTTP |
| TC-CS84-34 | Confirmed/post-confirmation legacy-configured frozen controls disabled; unrelated fields remain available. A provisional fence requires current matching-version server edit permission before enabling buffers; missing/stale proof remains disabled. Proven no-confirmation legacy configuration remains editable until first confirmation | Nuxt component |

## PO buffer clarification and recovery cases — 14 October 2026

These prospective specifications implement the later PO direction without changing the raw Session 3 transcript or relabelling old execution records. They require evidence at the named layers; a Staff attestation is not independent proof that external communication occurred. Separate shared Safety/notification/review/acceptance work remains pending.

| Test ID | Scenario / preconditions and steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- |
| TC-CS84-35 | Pre-policy locked venue with current/future Event commitments and at least one current/past confirmed booking. Staff reads the legacy context; try omitted/foreign/stale/incomplete communication, unauthorized Coordinator write, then matching current Coordinator/Organiser, booking versions, both attestations and a nonblank note | Invalid/unauthorized requests preserve buffers, version, allowance, history and outbox; valid request200 consumes the one-time allowance, retains the confirmed lock/approvals and records `LEGACY_BUFFERS_CONFIGURED` with `configuredAfterConfirmation:true` and authenticated Staff/time/reason/communication. Repeat409; a newly affected or reassigned Event requires fresh context | Real HTTP / memory; persistent evidence separately | 2026-10-14 |
| TC-CS84-36 | A Venue confirmation fence exists but no booking has ever been confirmed. Read matching-version buffer status and perform a normal Staff buffer edit; repeat with current/past confirmed booking, moved/cancelled confirmation history, post-confirmation/unknown legacy receipt, stale version or missing dependency | Proven uncommitted fence is recovered under the shared Booking venue lock; Venue saves new buffers, clears the provisional lock and records `BUFFER_FENCE_RECOVERED`/recheck atomically. Prior legacy receipts allow recovery only when all explicitly record `configuredAfterConfirmation:false`; true/missing classifications or historical/current confirmation deny without mutation. Later successful confirmation locks the current buffers | Fault-injected real HTTP; confirmation history and concurrency assertions | 2026-10-14 |
| TC-CS84-37 | Render Staff form with eligible legacy context, exact Venue version and per-Event communication. Complete both communication checks/note/reason and valid independent buffers; exercise matching and stale normal buffer permission | Legacy submission disabled until all required attestations/data are valid, then emits exact version/recipient/booking proof. Confirmed controls remain disabled. Matching positive server permission enables provisional-fence buffer edits; stale/missing permission stays disabled; unrelated fields remain editable | Nuxt component; production desktop/mobile evidence separately | 2026-10-14 |
| TC-CS84-38 | Real PostgreSQL legacy configuration, concurrent attempts and forced immutable-history/outbox failure; reconnect and rerun. Apply legacy migration to catalogue rows before/after recorded original-freeze completion | One committed configuration consumes the allowance once and retains buffers/lock/history after reconnect; concurrent loser is stale/locked. Failed atomic write rolls back every field/history/outbox change. Migration defaults false and grants allowance only to originally existing locked venues; buffers, versions, lock timestamps and history are unchanged | Venue/Booking PostgreSQL HTTP and actual migration probe | 2026-10-14 |
| TC-CS84-39 | Existing approved arrangements are initially nonoverlapping; coordinated one-time buffer configuration expands occupied windows into a conflict. Let durable recheck run, retry and restart | Existing booking IDs/approvals and parent Event lifecycle remain intact; current windows/conflict flags/history/notice intent update for review; no automatic cancellation or approval reset; acknowledgement/retry does not duplicate successful recheck effects | Real HTTP durable worker; persistence/restart evidence | 2026-10-14 |

## Legacy contact integrity — 14 October 2026

Date of Creation: 2026-10-14T16:38:36+08:00. An active legacy Event commitment must have verifiable current contacts; operational closures and ended commitments are not inferred to be Event arrangements.

| Test Case ID | Scenario / preconditions | Steps | Expected result | Layer |
| --- | --- | --- | --- | --- |
| TC-CS84-40 | Active inherited confirmed booking has no Event link | Staff requests consultation context and submits empty communication | Both operations503; Venue values, pending allowance, history and recheck remain unchanged | Real Venue/Booking HTTP |

## Legacy configuration before first confirmation — 14 October 2026

The one-time allowance concerns the legacy communication/configuration operation; consuming it does not itself count as the first confirmed booking. Ordinary pre-confirmation flexibility follows the PO's lock policy.

| Test Case ID | Scenario / preconditions | Steps | Expected result | Layer |
| --- | --- | --- | --- | --- |
| TC-CS84-41 | Legacy catalogue venue has no current or historical confirmed booking, including an empty affected Event list; no missing confirmation history. A later first-confirmation attempt fails after a provisional fence | Submit one-time initial configuration with exact derived consultation and spoofed public `retainLock:true`; perform a normal Staff buffer edit; attempt confirmation with injected failure; read buffer permission and recover the fence; separately spoof `retainLock:false` for a previously confirmed venue | Booking ignores caller lock choice and derives under its venue lock. No-confirmation configuration consumes allowance but clears blanket lock and records `configuredAfterConfirmation:false`; normal edits remain allowed. A later failed first-confirmation fence is recoverable only with actual provisional-fence history, every legacy receipt explicitly false, no historical confirmation and matching current version. Existing-confirmation configuration remains locked with `configuredAfterConfirmation:true` despite the caller's spoof. Unknown/true receipt or dependency failure denies recovery; no allowance is replenished | Real Venue/Booking HTTP; persistent and UI evidence separately |
| TC-CS84-42 | Actual PostgreSQL pre-confirmation legacy receipt | Private verified Booking fixture initializes with retainLock:false, reconnects, fences an interrupted first confirmation, then applies checked recovery | Explicit null lock and false receipt retained; initial allowance consumed; mandatory internal boolean; one recovery audit/recheck | PostgreSQL HTTP |


## Integrated acceptance additions — 2026-10-17T03:53:21+00:00

These cases supplement the preserved earlier specifications. Current contracts and the Session 3/PO precedence remain authoritative. Browser IDs can cover several linked story assertions; matching numeric suffixes in the shared sheet do not imply identical scenarios.

| Test Case ID | Requirement / expected result | Execution layer and precondition |
|---|---|---|
| TC-CS84-42 | A PG before-commit barrier times out downstream apply; durable owner pending fence blocks readiness; exact-operation resume records the update and receipt together. | Actual disposable Venue/Booking HTTP and owner PostgreSQL; opt-in CS_MAINTENANCE_ACCEPTANCE=1. The timed-out transaction may roll back or finish; both must remain safe and resumable. |


## 17 October shared-Sheet evidence reconciliation

Existing customer intent is preserved. Logical draft fields/statuses are reconciled with the operative contract; examples do not create a second reservation or acceptance claim. Date of Creation: 2026-10-17T12:24:00+08:00.

| Test Case ID | Scenario / AC | Preconditions | Steps | Expected result | Layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS84-03 | Buffer AC: Staff-owned configuration | Unconfirmed venue with30/45 minute buffers | Attempt PUT as Coordinator; read venue as Staff | 403; both buffers and version unchanged | Actual service HTTP with isolated repository fixtures | 2026-10-17T12:24:00+08:00 |
