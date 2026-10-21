# CS-47, test evidence and branch integration

Date: 21 October 2026 (Asia/Singapore). Branch: `feat/equipment`.

## Attendance delivery and fixture organization

Commit `1b47bf8` records today's Attendance work on top of the Equipment
implementation in `2e76961`:

- Added the Attendance service, Prisma schema/migration and seed, service
  routes, Kong/BFF wiring, and attendee list/detail and own-registration pages.
- The attendee event-detail heading uses `event.title`. Event identifiers remain
  available for metadata, URLs and links.
- The runnable browser scenarios cover confirmed details, registration-window
  presentation, private-field redaction, hidden non-confirmed events, cancelled
  own-registration access, and the empty list.
- Shared frontend E2E support lives under `frontend/e2e/fixtures/`, including
  `attendance-fixtures.ts`, `equipment-fixtures.ts`, `venue-fixtures.ts` and the
  shared helpers. The root helper entry point preserves existing spec imports.
- Attendance fixtures use the isolated `reviewDatabase('attendance', ...)`
  connection, unique synthetic records and test-scoped cleanup. This does not
  mean that each spec has its own Docker stack or process environment.
- CS-47 retains TC-01 through TC-09; TC-10 was removed as requested. TC-02
  (multi-venue projection), TC-06 (replacement venue) and TC-07 (live confirmation)
  remain explicit dependency stubs. Each is skipped rather than counted as a
  functional pass. The suite does not claim delivery of CS-48 registration.

The attendee detail page is
`frontend/app/pages/attendances/events/[id].vue`; browser cases and their fixture
are `frontend/e2e/CS-47.spec.ts` and
`frontend/e2e/fixtures/attendance-fixtures.ts`.

## Today's evidence publication

Updated only CS-40, CS-41, CS-42 and CS-47 records in the
[Sprint 3 test sheet](https://docs.google.com/spreadsheets/d/1V7Hkl3rjEqGSht5HLrfLYVJlZKbwBkL2qEh0S0YF1C8/edit?gid=1620063509#gid=1620063509).
Statuses and remarks identify the executed layer. Evidence links and cell notes
identify the original case, viewport/project and run.

The [Equipment And Attendance Evidence folder](https://drive.google.com/drive/u/1/folders/1DJzBVuyhXeoDf-NPk4R9ruIVmcLx8EVu)
contains all 32 files uploaded for this work: 21 successful-case PNG captures,
seven original Playwright result JSON files and four story summaries. Failure
screenshots were excluded from the successful screenshot set.

These Playwright results were produced before the main merge below. They are
retained as evidence for that earlier source, not as a new merged-source run:

| Story | Latest retained successful execution and limits |
| --- | --- |
| CS-40 | Mobile selection: 14 passed, no failures. TC-CS40-13 targeted desktop/mobile regression: 2 passed. The earlier complete desktop run had 11 passes and 6 failures; a complete green desktop rerun is not claimed. |
| CS-41 | All 36 desktop/mobile CS-41 executions passed within the combined CS-41/42 run. That combined run had 60 passes and 2 CS-42-13 failures overall. |
| CS-42 | TC-CS42-01 through TC-CS42-12 passed in both projects. The two TC-CS42-13 failures in the combined run were followed by a targeted desktop/mobile run with 2 passes. A complete post-fix combined rerun was not performed. |
| CS-47 | Desktop and mobile each had 6 passes, 3 known dependency stubs skipped and no failures. A separate TC-CS47-08 desktop follow-up also passed. |

Source artifacts are under `frontend/test-results/e2e/`: `cs40-mobile-final`,
`cs40-regression-final`, `cs41-42-final`, `cs42-regression-final`,
`cs47/desktop-final`, `cs47/mobile-final` and
`cs47/desktop-registration-final2`.

Service verification before the main merge passed Equipment unit 35/35,
Equipment in-memory HTTP integration 20/20, Attendance unit 22/22 and Attendance
in-memory HTTP integration 7/7. Equipment's HTTP run explicitly excluded its
PostgreSQL file: the complete integration/coverage command requires a migrated,
dedicated `equipment_test` database. Initial HTTP listener errors were sandbox
restrictions; the same HTTP checks passed with loopback binding enabled.

## Git pulls and conflict decisions

The initial working tree was clean. Both pulls use merge commits and preserve
the local commits; no rebase, force-push or hard reset was used.

1. Pulled `origin/feat/equipment` at `fd7a150`, producing merge `ddcfea7`.
   The 56 conflicts came from the older remote CS-40 implementation and its
   earlier repository layout. The corresponding CS-40 files match the earlier
   local implementation, while later local commits already contain the queue
   reload and timezone fixes. The resolution retains the newer implementation,
   moved pages, current tests and evidence tools, and avoids duplicate Equipment
   CI jobs and gateway routes. The resulting source tree equals `1b47bf8`.
2. Pulled `origin/main` at `a7749cb` into the feature branch. Eight conflicts
   required combining the two development histories, API documentation,
   relocated fixture imports, Booking hours tests and service coverage scripts.

The main integration includes the resolved Coordinator-request / Staff-approval
venue policy, the complete-interval daylight-saving operating-hours fix and its
unit/HTTP/PostgreSQL/browser regressions, CS-50/51 verification additions, and
CS-79 coverage enforcement. Equipment's CS-40–42 contract and all Attendance
implementation and fixture files remain intact.

Conflict resolution retains both DEVLOG histories and both sets of Booking
hours unit cases. CS-38, CS-85 and the newly added CS-87 fixture import use
`./fixtures/venue-fixtures`. Main's coverage flags target Equipment's current
`tests/integration/*.test.js` layout rather than the retired `tests/postgres`
directory. Booking and Equipment retain their all-source combined 81% gates;
Booking's native unit floors are also retained in `test:coverage:unit`.
The [coverage policy](../coverage-policy.md) explains the changed suite scope.

Frontend typechecking also exposed an existing implicit `any` in the technical
request BFF's equipment mapping. Adding the equipment-line response type fixes
the annotation without changing runtime behavior.

Main's removal of 60 superseded or zero-execution historical test reports is
included with its [retention index](../../tests/records/README.md). Those removed
versions remain recoverable from Git history and the pre-merge backup below;
the new Drive evidence is unaffected.

Recovery references retained locally:

- `backup/feat-equipment-before-pull-20261021-1b47bf8`
- `backup/feat-equipment-before-main-20261021-ddcfea7`

## Verification of the merged working tree

Executed with local Node 26.0.0. CI continues to use Node 22; these local results
do not replace CI or a full isolated PostgreSQL/browser run.

| Check | Result |
| --- | --- |
| `npm run test:unit --prefix services/booking-service` | 67 passed, including the original hours case and eight incoming operating-hours regressions. Startup socket checks passed with loopback access enabled. |
| `npm run test:coverage:unit --prefix services/booking-service` | Passed with 67 tests; native loaded-source coverage: 53.01% lines, 85.16% branches, 61.14% functions, above its 30/70/25 floors. This is separate from the combined all-source 81% gate. |
| `npm run test:unit --prefix services/equipment-service` | 35 passed |
| `npm run test:unit --prefix services/attendance-service` | 22 passed |
| Focused Vitest CS-38 and CS-85 specs, mock auth and in-memory HTTP fixtures | 58 passed across 2 files |
| `npm run typecheck --prefix frontend` | Passed |
| `npm run typecheck:e2e --prefix frontend` | Passed |
| Playwright collection of CS-38/40/41/42/47/85/87 | 124 tests collected across 7 files; collection only |
| Workflow, Compose and Equipment OpenAPI YAML; service package manifests | Parsed successfully |
| `git diff --check` | Passed |

Full Playwright execution, PostgreSQL integration, aggregate coverage and the
new coverage negative-control runner were not rerun for the merged source.
Their earlier records retain their own dates, scope and results. No push or
remote publication of the Git merge is part of this work.
