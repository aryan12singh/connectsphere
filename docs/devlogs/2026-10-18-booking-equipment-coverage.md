# Booking and Equipment coverage / CS-40–42 verification

Date: 2026-10-18 (Asia/Singapore). Verification uses the current uncommitted
working tree, Node 22.23.3 and an isolated PostgreSQL/Docker test environment.

## Combined service coverage

The service `test:coverage` commands now merge V8 execution data from module
unit tests and service integration tests with c8. Booking also instruments the
Node server subprocesses launched by its existing Python HTTP-contract tests.
Percentages are computed from merged counters, not averages of suite reports.

| Service | Statements | Branches | Functions | Lines | Complete source files |
| --- | ---: | ---: | ---: | ---: | ---: |
| Booking | 97.76% | 82.29% | 98.42% | 97.76% | 25 |
| Equipment | 97.15% | 88.54% | 100.00% | 97.15% | 14 |

Both commands enforce a global **81% minimum in every category**, which is
strictly above the requested 80%. Reports include every `src/**/*.js` file;
no source files were removed or newly excluded. Ordinary unit, integration and
Booking contract commands remain available. Booking's former unit-only
coverage command remains available as `test:coverage:unit`.

Verification: Booking **82 Node tests plus 15 Python HTTP-contract tests**;
Equipment **56 Node tests**; all passed under Node 22. Expected database errors
from explicit rollback fault injection are asserted test outcomes, not suite
failures. CI runs the aggregate gates and retains JSON, LCOV and HTML reports.

Run from the corresponding service directory after installing the lockfile,
generating Prisma and deploying migrations to a disposable `<service>_test`
database:

```sh
DATABASE_URL=postgresql://connectsphere:connectsphere@127.0.0.1:5432/booking_test npm run test:coverage
DATABASE_URL=postgresql://connectsphere:connectsphere@127.0.0.1:5432/equipment_test npm run test:coverage
```

Reports: `services/booking-service/coverage/` and
`services/equipment-service/coverage/`, including `coverage-summary.json`,
`coverage-final.json`, `lcov.info` and `lcov-report/index.html`.

## Cases and execution

All **41 recorded cases** now have one executable E2E declaration each:
CS-40-01–15, CS-41-01–14 and CS-42-01–12. The existing three flat story files
are retained. Each title contains its own full canonical case ID. No case is
adopted through another story's file, and no skip/fixme placeholder is used.
Records link directly to the adopting file; historical runs remain intact.

`npm run test:traceability:equipment` from `frontend` checks missing and
duplicate case IDs, foreign story IDs, skipped/only markers and invalid record
links. The isolated CI runner performs this check before browser execution.

The three focused story-spec files passed **12/12**; new dated records are under
each story's `tests/records/CS-*/test-runs/`. Existing mislabeled spec cases were
mapped to the canonical IDs, and the stock-five/reserved-two/operation-one
fixture now matches CS-41-04. Earlier execution records were not rewritten.

Final desktop/mobile E2E execution: **82/82 passed**, with **0 unexpected,
0 flaky and 0 skipped** results, and no Playwright reruns. CS-40 passed 30/30,
CS-41 passed 28/28 and CS-42 passed 24/24 (every recorded case on both projects).
The final run started at 2026-10-18T03:12:30.694Z. Per-case execution records:
[CS-40](../../tests/records/CS-40/test-runs/2026-10-18T03-12-30Z-GREEN-BROWSER.md),
[CS-41](../../tests/records/CS-41/test-runs/2026-10-18T03-12-30Z-GREEN-BROWSER.md),
[CS-42](../../tests/records/CS-42/test-runs/2026-10-18T03-12-30Z-GREEN-BROWSER.md).
Machine-readable results: `/tmp/cs40-42-20261018.keLqtx/evidence/final/results.json`;
HTML report: `/tmp/cs40-42-20261018.keLqtx/evidence/final/html/index.html`.

The browser environment is `csreview-aryan-ci-equipment-20261018`, frontend
`http://127.0.0.1:34000`, with real Nuxt/BFF, Kong, Keycloak, PostgreSQL and
RabbitMQ in Node 22 service containers. Browser plugin was unavailable; the
repository's Playwright workflow was used. Synthetic users and project-owned
databases are used. Dependency-owned assignment, expiry and rework states are
fixtures; the acceptance assertions concern Equipment-owned outcomes, rather
than claiming acceptance of those dependency stories.

Evidence is retained at `/tmp/cs40-42-20261018.keLqtx/evidence/`. Initial failed
runs and the focused hydration regression are preserved alongside the final
run. Screenshots, HTML, JSON and generated per-story browser records are kept.

## Regressions exposed and corrected

- Current Event assignment now governs both technical-request reads and
  revisions; an old persisted Coordinator ID no longer grants access.
- Operational command retries persist one result, including concurrent retries.
- Readiness requires reservation lines for the approved current request version
  and becomes pending when operational supply cannot fulfil the commitment.
- Atomic replacements exclude their own old stock and retain the old reservation
  on failure. Serializable contention returns a retryable 409 rather than a 500.
- Equipment Docker configuration now supplies its Booking service URL, and the
  missing seed file no longer aborts isolated setup.
- The Support page exposes dated line-level availability and operational controls
  using existing shadcn-vue Button, Input and Field components and semantic theme
  tokens. Inventory inputs and save actions remain disabled until hydration so
  early browser input cannot be overwritten and falsely reported as saved.

## Wider suite limitation

The complete frontend suite was also exercised: **394 passed, 4 failed**, with
all 26 files attempted. The four remaining failures are in `tests/specs/CS-10`
and report `backendFetch is not defined` in their direct Auth-handler fixture
(valid session, invalid credentials, unknown roles and Safety Officer login).
Auth source and Auth test files were deliberately left unchanged as requested.
These failures are separate from the passing service gates and CS-40–42 specs.

Frontend application/E2E type-checking and a Node 22 production build passed.
No existing development database was migrated, reseeded or removed. Test
database migrations and fault-injection triggers were confined to disposable
databases; triggers are cleaned up in `finally` blocks.
The isolated Compose project was shut down after verification (containers and
network removed). Its database/RabbitMQ volumes and evidence were retained;
the existing development stack was not stopped.
