# CS-79 coverage gate delivery

17 October 2026. Aryan. Branch `chore/cs79-coverage-gates`, created from main
`7867f24` after PR #11 merged. This is the shared coverage-policy follow-up;
the venue/Safety feature behavior and Q2 interpretation are unchanged.

## Delivered

- [Measured policy](../coverage-policy.md): frontend 65% statements/lines/functions
  and 60% branches; separate native Node line/branch/function floors for all seven
  service unit and PostgreSQL suites. Source scopes and limitations are explicit.
- Event excludes test files and includes shared role helpers. Event/Equipment
  PostgreSQL suites now collect coverage. Event's database report is archived
  separately from its unit report.
- The existing required merge gate retains all build, typecheck, service,
  database, contract, browser/broker and restart prerequisites. A new mandatory
  frontend step proves real coverage failure propagation and preserves separate
  negative-control reports.
- [Blue cases and dated local execution](../../tests/records/CS-79) link the
  implementation to actual outcomes. Raw reports/control fixtures stay outside
  Git or in CI artifacts; no dependency or raw evidence files are added.

## Verified locally

Native Node 22.23.3, locked installs and a newly created isolated PostgreSQL 16
container. All14 service unit/database coverage commands pass their floors;
all existing contract commands pass. Frontend 386/386, both typechecks and the
production build pass. One positive Node control passes; all three intentionally
strict Node metric controls reject through Bash/pipefail/tee. Actual CS-78 focused
frontend 17/17 passes with no skips/setup failures while the normal global floors
correctly return exit 1 through the actual npm command and report wrapper.

The first local Venue database baseline inherited a mismatched test key from the
external orchestration script; rerunning with the workflow's normal environment
passes 13/13. The first proof harness referenced an absent Vitest JSON field; it
now checks the actual failed/pending suite fields. Both diagnostics are retained
outside Git, separately from passing results; neither required a product change.

## Remaining

Obtain independent PR/policy approval, merge this follow-up and verify green CI
on that main merge. Aryan confirmed manual/PO/author-walkthrough acceptance for
CS-36/39/84/85/86/87/93/94/95; their shared coverage blocker can then clear.
CS-37/38 retain pending Q2. CS-74 model review, CS-78 spike review/timebox and
CS-96 actual team adoption are unconfirmed. CS-76 retains Q2 and actual planning
records. No story, peer task, meeting outcome or PO answer is closed by this log.
