# Sprint 3 coverage policy — CS-79

Decision date: 17 October 2026. Aryan authorized selecting and implementing
baseline-derived thresholds; peer review of this change records adoption. This
replaces the earlier pending numerical-policy wording. The separate
[17 October venue-policy clarification](venue-policy-decisions.md) resolves Q2;
these numerical coverage floors do not change the booking or Event lifecycle.

## Metrics and initial floors

Use Node 22, locked installs and disposable migrated PostgreSQL databases. The
baseline is merged main `7867f24`, with the same production code and tests.
Thresholds use coarse five-point steps with at least two percentage points of
headroom. They prevent substantial regression while allowing a measured starting
point; they are not a claim that percentage coverage proves acceptance.

Frontend V8 baseline, in percent:

| Metric | Measured | Required minimum |
| --- | ---: | ---: |
| Statements | 68.97 | 65 |
| Lines | 70.66 | 65 |
| Branches | 65.07 | 60 |
| Functions | 69.61 | 65 |

Vitest includes `frontend/app/**/*.{ts,vue}`, `frontend/server/**/*.{ts,js}` and
`frontend/lib/**/*.ts`. Existing exclusions remain declarations (`**/*.d.ts`)
and generated UI primitives (`frontend/app/components/ui/**`). No application,
venue, Safety, BFF or validation file is newly excluded. Global floors include
unexecuted matching frontend source. `autoUpdate` is off; policy changes require
review rather than silently lowering a floor.

Each service suite independently enforces line, branch and function coverage;
there is no cross-service average and no substitution of unit for database tests.
The executable floors live in each service's `test:coverage` and
`test:integration` npm scripts:

| Service | Unit minimum: lines / branches / functions | PostgreSQL minimum: lines / branches / functions |
| --- | ---: | ---: |
| Auth | 70 / 70 / 55 | 55 / 65 / 25 |
| User | 65 / 70 / 50 | 75 / 55 / 55 |
| Venue | 50 / 70 / 45 | 65 / 55 / 65 |
| Booking | 30 / 70 / 25 | 75 / 55 / 70 |
| Event | 60 / 70 / 55 | 60 / 70 / 50 |
| Equipment | 95 / 60 / 95 | 75 / 45 / 70 |
| Notification | 80 / 60 / 80 | 65 / 45 / 60 |

### 21 October 2026 integration with the expanded Equipment branch

The Booking and Equipment suites have since expanded beyond the baseline above.
Their `test:coverage` commands retain the all-source c8 gate introduced on this
branch: **81% statements, lines, branches and functions**, measured across unit,
HTTP integration and PostgreSQL tests, plus Booking's Python HTTP contracts.
Every `src/**/*.js` file remains in that combined denominator. These commands
remain the CI coverage entry points; they replace the corresponding baseline
unit-only commands in the table rather than lowering the combined gate.

Booking also exposes the baseline native unit floors through
`test:coverage:unit`. Both services retain main's separate integration floors
shown above. Equipment's integration command uses its current
`tests/integration/*.test.js` layout, including the PostgreSQL suite, instead of
the retired `tests/postgres` path. The baseline Equipment unit-only 95/60/95
measurement describes the earlier, smaller source tree and is not a measurement
of this expanded combined suite. Dedicated `<service>_test` databases are still
required for combined coverage and PostgreSQL verification.

Node's native test runner counts loaded source matching `src/**/*.js`, not an
inventory of every unimported file. Event also includes shared production role
helpers at `../utils/**/*.js`; its earlier report included test files and is not
the baseline for these floors. All other services retain their existing source
filter. Event and Equipment database suites now collect/enforce source coverage
as well. Test files, dependencies and generated Prisma clients are outside the
source denominator. Do not compare or average these loaded-source percentages
with Vitest's all-matching-file frontend denominator.

The lower Booking/Venue unit floors reflect that database workflows are exercised
in their separately mandatory PostgreSQL suites. Equipment's small unit domain is
fully line/function-covered; the database suite tests the API and persistence.
Keep both layers and their distinct scopes visible. Raise floors as meaningful
tests grow; changes to scope, exclusions or floors need rationale and review.

## Enforcement and reproduction

From a service folder, run `npm run test:coverage` and `npm run test:integration`
with the README's isolated database/auth settings. Native
`--test-coverage-lines`, `--test-coverage-branches` and
`--test-coverage-functions` flags return exit 1 below a floor. Frontend
`npm run test:coverage` uses Vitest's configured global thresholds; the existing
report wrapper preserves its exit status. Keep raw outputs outside Git.

The existing required aggregate `Sprint 2 checks` retains its name for branch
protection. Its frontend and seven service prerequisites enforce these floors;
explicit Bash/pipefail preserves a failure through `tee`. Typechecks, production
build, HTTP contracts, PostgreSQL, live browser, broker and restart checks remain
required. The existing workflow runs for every PR and main push.

After a normal frontend coverage run, reproduce the fail-control checks from
repository root with the same frontend test environment:

```bash
CS_COVERAGE_PROOF_DIR=/absolute/new/evidence-directory \
  node tests/scripts/verify-coverage-gates.mjs
```

The proof executes a passing Node fixture, then rejects each 100% line/branch/
function control through the real Bash/pipefail/tee boundary while its assertion
still passes. It also runs the actual CS-78 focused frontend suite: all assertions
must pass without skips/setup errors, while the normal global frontend floors
return exit 1 through the actual npm command and its report wrapper. A missing report, assertion/setup failure, signal or absent
coverage-failure message fails the proof. CI stores its logs, focused JSON and
coverage report separately in `frontend-evidence/coverage-gate-proof`; the full
passing frontend report is preserved. Expected negative controls are not product
defects or fabricated passing runs.

See [CS-79 cases and dated results](../tests/records/CS-79), the
[CI workflow](../.github/workflows/event-workflows.yml), and
[Definition of Done](DEFINITION_OF_DONE.md). The nine already accepted stories
still need this policy PR approved/merged and green CI on that main merge before
their shared coverage closure blocker is cleared.

Mechanism references: [Node 22 native coverage flags](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#--test-coverage-linesthreshold)
and [Vitest coverage thresholds](https://vitest.dev/config/coverage#coverage-thresholds).
