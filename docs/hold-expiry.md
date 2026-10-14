# Hold expiry and occupied-window foundations

CS-78 technical spike and CS-85 domain foundation, initially 9 October 2026;
integration updates 12–13 October. The research worker below still uses disposable
PostgreSQL tables. Production requests, decisions, extensions, search, calendar
and readiness now persist/use buffers, versions and deadlines. The production
expiry/reminder scheduler (CS-90) and actual notification delivery remain pending;
see the [agreed policies](venue-policy-decisions.md).

## Reusable domain code

[occupiedWindow.js](../services/booking-service/src/occupiedWindow.js) expands
`[startAt, endAt]` into `[startAt − setupMinutes, endAt + turnaroundMinutes]`.
It returns normalized UTC instants without mutating the booking. Non-negative
whole minutes must be supplied. There is no guessed zero default or 480-minute
cap. `occupiedWindowsOverlap(a, b, { allowTouching })` requires an explicit
boolean; positive overlap is rejected under either choice.

[holdClock.js](../services/booking-service/src/holdClock.js) accepts a persisted
deadline and supplied check instant. `holdIsExpired` returns true at or after
the deadline; `holdWarningDue` returns true only while active and within the
explicit lead. `validateHoldDeadline` requires creation before expiry and an
explicit inclusive/strict occupied-start policy. These helpers share the
[instant parser](../services/booking-service/src/time.js): explicit offset,
calendar-valid ISO input, at most millisecond precision and finite Date range.
Sub-millisecond input is rejected rather than silently truncated.

They are exported through `availability.js` and reused by production
[workflows](../services/booking-service/src/workflows.js). Availability now derives
current occupied intervals and excludes ineffective holds. Writes serialize on
Event/venue locks, use the current database clock after waits and upstream checks,
and refuse stale/expired decisions. Calendar projections expose expiry and
separate buffer shading without changing the advertised Event time.

## Read responsibilities and worker responsibilities

The technical model occupies a slot when approved, or when active with
`expiresAt > checkedAt`. Effective availability excludes expired active rows even
before a job updates them. This is a read projection, not an audit mutation.
The prototype returns qualifying hold IDs. Production availability and conflict
rechecks now retain occupancy through the current occupied-window end, including
turnaround; advertised end alone does not release an occupied room.
Approval rechecks that same inequality under the row lock. Expiry takes priority
over a warning during catch-up; no stale warning is queued after expiry.

The default clock is PostgreSQL `clock_timestamp()` after acquiring the row lock.
Transaction `NOW()` is unsuitable because it remains fixed at transaction start
while another transaction holds the row. The proof also accepts an explicit
controlled clock for boundary tests. Production services need a consistent UTC
instant contract; human displays retain the venue/Event IANA timezone.

## Runnable persistence proof

[hold-expiry-store.cjs](../services/booking-service/tests/spikes/hold-expiry-store.cjs)
is test-only. `ACTIVE`, `APPROVED`, `EXPIRED` and the `holds`/`actions` table names
are research fixtures, not proposed replacements for current business enums.
The factory refuses non-local targets, any database except `booking_test`, and
any schema outside a generated `cs78_<32 hex>` name. It creates no application
migration and writes no production tables. Normal completion/failure drops its
scratch schema and disconnects the client; initialization failure cleans up a
schema only when this invocation created it.

| Mechanism | Proof and production implication |
| --- | --- |
| Approval/expiry transaction | Row lock plus conditional active/deadline update allows one terminal winner. Approval at the deadline fails. A successful earlier approval clears the lease; an old worker then does nothing. |
| Multiple workers | One SQL claim with `FOR UPDATE SKIP LOCKED`, explicit batch size and persisted lease. Concurrent workers get disjoint rows and do not wait for a locked candidate. |
| Crash/retry | Lease deadline is persisted. At the lease boundary another attempt may claim; a fresh token fences the old attempt even with the same worker identity. |
| Revision fencing | Research claim contains booking ID, version and token; processing requires all to match, with an unexpired lease. A controlled fixture revision invalidates the old claim. The separate production extension API checks the booking version and current deadline. |
| Warning deduplication | `warned_version` plus deterministic `booking:version:HOLD_WARNING` action ID. No warning after expiry; an explicit zero lead disables the warning. |
| Release/notice intent | Expiry updates the row and inserts `booking:version:HOLD_EXPIRED` in one transaction. A rejecting SQL constraint rolls back the transition and leaves a retryable claim. |
| Restart/catch-up | Disconnect/reconnect uses the same schema without reseeding. Deadline/lease survive and the expired row is already excluded on read; the resumed worker produces one expiry action. |

The action table proves durable intent, not message delivery. CS-90 must integrate
the actual booking/activity/outbox schema reviewed in CS-77; CS-50/51 must deliver
in-app notices using a stable deduplication key. Delivery consumers must also be
idempotent. Email is optional under the present channel decision.

For integration choose an agreed polling interval, worker batch/lease configuration
and retry backoff. Do not claim a one-minute customer SLA or deployment from this
local run. Track overdue work, failed intents and lease retries. The team has not
yet recorded the planning timebox/policy approvals or independent spike review.
Event completion (CS-31) and waiting-list offers (CS-49) may reuse clock/lease
mechanics, but need their own business transitions and deadlines.

## Shared scheduling impact review — 13 October 2026

CS-78 identifies the following reusable mechanisms and distinct policies. This
analysis is available for the owners' review; it does not implement their jobs,
record an agreed spike timebox or settle customer processing targets.

| Owner story | Reusable mechanism | Business proof and boundary |
| --- | --- | --- |
| CS-90 hold expiry/reminders, Sprint 4 | UTC database clock after lock waits, bounded lease claims, token/version fencing, atomic transition plus outbox and repeat/restart deduplication | Saved hold deadline and current booking version; extension invalidates older claims; expiry removes only its commitment; current venue readiness excludes expired holds immediately |
| Javier CS-31 Event completion | Controlled current-clock check and a repeat-safe status/history/outbox transaction | Agreed parent lifecycle, current Confirmed state and Event end; do not complete a Planning/pending-Safety Event or use a room's turnaround end as the Event end |
| CS-49 waiting-list offer expiry | Bounded claims and deadline/version fencing reusable after attendance ownership/contract review | Offer deadline is the recorded48-hour-or-registration-close policy, distinct from hold duration; acceptance versus expiry has one winner, and releasing/offering a place changes capacity exactly once |
| Marc CS-50/51/52 delivery | Stable action/recipient/type identity, durable retries and consumer deduplication | Deliver only permitted current links/content; message retry never replays a booking, confirmation, withdrawal or offer command |

Individual hold expiry, room replacement or cancellation must not generate an
Attendee withdrawal, release unrelated equipment or automatically cancel/complete
the parent Event. A reusable scheduler cannot supply those business decisions.
Record agreed target intervals, failure visibility and owners in CS-76/77 before
their production jobs; numerical warning/processing targets remain pending.

## Run and evidence

Use Node 22 and a fresh local PostgreSQL 16 **`booking_test`** database. Credentials
in this example are synthetic for a disposable local fixture:

```bash
cd services/booking-service
npm ci
export DATABASE_URL='postgresql://connectsphere:isolated-test-only@127.0.0.1:5432/booking_test'
npx prisma generate
# Usual service regressions also need npx prisma migrate deploy.
CS_HOLD_SPIKE_RESULTS=/tmp/cs78-postgres.json npm run test:hold-spike
```

From `frontend/`, run the two domain specs through the shared reporting command:

```bash
npm ci
TEST_RESULTS_JSON=/tmp/venue-domain.json npm run test:report -- \
  ../tests/specs/CS-78.spec.ts ../tests/specs/CS-85.spec.ts
```

These two files use Vitest's Node environment and need no database. Full frontend
regressions require the migrated isolated Event database described in the README.
Convert actual spike results using the existing record compiler from repo root:

```bash
node --experimental-strip-types tests/scripts/compile-test-run.ts \
  CS-78 /tmp/cs78-postgres.json GREEN
```

The report keeps missing cases Not Executed and records its layer. Raw JSON,
coverage and logs remain outside Git or in CI artifacts. The existing Booking
CI job runs the spike on every supported branch push/PR and archives both logs
and JSON. It remains part of the existing required `Sprint 2 checks` aggregate.

[CS-78 cases and dated runs](../tests/records/CS-78/test-cases.md) contain 17 domain
checks (cases 01–05) and ten PostgreSQL scenarios (06–15). Case 07 exercises 12
exact-deadline races, six races straddling the boundary, and the real database
clock. Case 14 observes an actual PostgreSQL lock wait before advancing the
controlled clock. [CS-85 cases](../tests/records/CS-85/test-cases.md) include domain
and later component/preflight checks. Separate CS-36/37/38/39/84/86/87 records cover
integrated venue workflows; a passing related case does not imply execution of
every original API/browser scenario. Failed runs remain alongside reruns.
[Phase delivery](devlogs/2026-10-12-venue-workflows.md) records current layers,
commands and remaining gates. Neither the spike nor this phase establishes PO
acceptance or completed Safety/notification stories.

## Agreed team timing — 14 October 2026

Default holds are 72 hours capped at setup. The current Coordinator submits a versioned extension request; Venue Staff approves that exact requested deadline, at most once and up to 24 hours later, still capped at setup. The persisted request/count, activity and outbox are atomic. Pending requests retain the old expiry, expired holds cannot be extended, and migration preserves previously spent extensions through retained outbox history. Ordinary arrangement changes invalidate a pending request without replenishing the count.

The warning threshold is 24 hours. Creation inside that threshold queues VenueHoldExpiring intent immediately, once per idempotent request. This is not delivery: CS-90 must process later warning thresholds/expiry, and CS-50/51 must deliver notices to the current Coordinator while suppressing obsolete deadline messages. No Event cancellation or equipment release follows individual hold expiry. Polling interval, lease/batch settings are engineering configuration, not additional customer policy questions.
