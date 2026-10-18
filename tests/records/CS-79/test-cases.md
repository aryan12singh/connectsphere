# CS-79 — Coverage Gate Test Specification (IS212 / IEEE 829)

Blue section. Date of Creation: 2026-10-17 (Asia/Singapore).

Source: [CS-79](https://spmg8.atlassian.net/browse/CS-79) and the Sprint 3
[coverage decision](../../../docs/coverage-policy.md). These cases verify the
shared coverage gate. Existing feature suites own their business acceptance;
Q2 is resolved separately in the [17 October venue policy](../../../docs/venue-policy-decisions.md). Model/spike review and team adoption are not inferred from these coverage checks.

| Test Case ID | Scenario | Pre-conditions | Test Steps / Test Data | Expected Result | Automation layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS79-01 | Current frontend meets its floor | Node 22, locked dependencies, migrated isolated Event database and explicit fixture authentication | Run the full frontend coverage command | All assertions pass; statements/lines/functions≥65%, branches≥60%; full report retained | Actual frontend unit/component/API suites + V8 | 2026-10-17 |
| TC-CS79-02 | Every service layer meets its own floor | Separate migrated disposable databases, matching service auth settings | Run all seven `test:coverage` and seven `test:integration` commands | Every suite passes its independently configured line/branch/function floors; production-only source scope retained | Native Node unit/HTTP + actual PostgreSQL | 2026-10-17 |
| TC-CS79-03 | Positive control reaches the shell boundary | Temporary isolated fixture with one passing assertion | Run a 1% line floor through Bash/pipefail/tee | Assertion passes; exit 0; real nonempty source report present | Native coverage execution | 2026-10-17 |
| TC-CS79-04 | Line regression rejects | Same fixture; intentionally unexecuted code | Require 100% lines through Bash/pipefail/tee | Assertion still passes; explicit line-coverage failure; exit 1 retained after tee | Native coverage execution | 2026-10-17 |
| TC-CS79-05 | Branch regression rejects | Same fixture; only one conditional branch executed | Require 100% branches through the real shell boundary | Assertion passes; explicit branch-coverage failure; exit 1 | Native coverage execution | 2026-10-17 |
| TC-CS79-06 | Function regression rejects | Same fixture; one exported function uncalled | Require 100% functions through the real shell boundary | Assertion passes; explicit function-coverage failure; exit 1 | Native coverage execution | 2026-10-17 |
| TC-CS79-07 | A real passing focused suite cannot satisfy the whole frontend floor | Installed frontend; separate output paths | Run actual CS-78 spec with normal configured global floors via the report wrapper | Tests pass with no pending/failed suites; nonempty coverage summary and an explicit threshold failure; wrapper returns1; proof succeeds only after checking the failure reason | Actual frontend suite + npm report boundary | 2026-10-17 |
| TC-CS79-08 | Integrated PR checks and evidence retention | A pushed PR revision | Run required workflow, inspect all jobs and downloaded coverage/proof artifacts | Every prerequisite and aggregate succeeds; negative-control exit 1 logs remain labelled and separate from passing reports | Hosted CI + fresh live/browser/restart stack | 2026-10-17 |

Main-merge CI and independent PR approval remain future gates until they happen.
The committed dated run records actual execution layers/results; raw reports,
JSON, HTML and control fixtures remain external or in CI artifacts.
