# Equipment CS-40–42 — testing structure and coverage

Date: 2026-10-17 (Asia/Singapore)  
Branch: `feat/equipment`  
Scope: Equipment service unit/integration organization, CS-40 form limits and
status, story test classification, and coverage reporting.

## Delivered

- Added module-specific Equipment service unit tests for auth, config, database
  adapter, request/period/availability domain behavior, event context, stock
  inventory, and memory/Prisma store behavior.
- Added distinct HTTP integration cases for app middleware, route authentication,
  version conflicts, idempotent decisions, inventory authorization, and service
  startup. HTTP boundary assertions are counted as integration tests.
- `test:coverage` now includes both unit and integration files and enforces
  aggregate thresholds of 80% for lines, branches, and functions; Node reports
  statements alongside lines.
- CS-40 form displays available physical stock maxima, enforces the 1000/500
  character caps, and explains direct `NOT_REQUIRED` declaration without a
  Support review or reservation step.
- CS-40/41/42 test-case records identify Unit, Integration, or E2E. Ten E2E
  scenarios are mapped to CS-40 and the existing CS-93 inventory/reservation
  proof workflow.

## Verification evidence

- Equipment `npm run test:coverage`: 38 passed, 0 failed; statements 98.95%,
  branches 89.28%, functions 100%, lines 98.95%.
- Equipment `npm run test:integration`: 12 passed, 0 failed.
- Equipment `npm run check`: passed.
- `prisma validate` and `prisma generate`: passed. No migration was applied.
- Frontend focused `tests/specs/CS-40.spec.ts`: 5 passed; E2E TypeScript check
  passed; Playwright `--list` found 94 configured tests across desktop/mobile.
- Full frontend Vitest: 324 passed, 59 skipped, 14 failed across 7 test files.
  Failures include `backendFetch` missing in CS-10 auth tests, missing
  `DATABASE_URL` for CS-11/30 and CS-27/29 service fixtures, missing `dotenv`
  for CS-39 fixtures, and the CS-93 projector-stock selector mismatch. These
  are not established as regressions from the focused CS-40 changes.
- Live E2E was not run because `docker ps` could not connect to the Docker
  daemon socket. E2E coverage is mapped, not execution-verified.

## Remaining work / acceptance limits

The CS-41/42 availability and reservation HTTP workflows, durable reservation
implementation, Safety readiness routes, and Equipment OpenAPI document remain
unwired in this worktree despite their shared API contract/schema entries. The
full browser stack is also unavailable until Docker is started. Do not claim
CS-40–42 acceptance until these behaviors are implemented and the E2E scenarios
are run against the real service stack.

The pre-existing local edit in `gateway/kong/kong.yml` was preserved. No commit,
push, or database migration was performed.
