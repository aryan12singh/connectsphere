# Hold expiry and occupied-window foundations

CS-78 technical spike and CS-85 domain foundation, 9 October 2026. The runnable
proof uses real PostgreSQL transactions in a disposable schema. It is not wired
to business routes, the calendar or a scheduler. CS-37/90 and the full CS-85
consumer integration remain unfinished; see the [pending policies](venue-policy-decisions.md).

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

They are exported through `availability.js` for future consumers. The existing
`filterAvailability`/route behavior is unchanged. CS-85 must later apply the same
reviewed rule to search, calendar shading, suitability and booking writes; CS-39
must enforce competing writes atomically. Existing API data still lacks buffers
and hold deadlines.

## Read responsibilities and worker responsibilities

The technical model occupies a slot when approved, or when active with
`expiresAt > checkedAt`. Effective availability excludes expired active rows even
before a job updates them. This is a read projection, not an audit mutation.
The prototype returns qualifying hold IDs; interval selection and advertised
end-time release belong to the eventual booking availability integration.
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
| Revision fencing | Claim contains booking ID, version and token; processing requires all to match, with an unexpired lease. A controlled fixture revision invalidates the old claim. This is not an implemented hold-extension API. |
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
controlled clock. [CS-85 cases](../tests/records/CS-85/test-cases.md) contain 35
domain checks; original API/browser cases 02–06 and 08–10 stay Not Executed.
Failed runs are retained alongside successful reruns. [DEVLOG](devlogs/DEVLOG.md)
records the tested revision/fingerprint and final counts. These checks verify
the foundation and spike, not completed production stories or PO acceptance.
