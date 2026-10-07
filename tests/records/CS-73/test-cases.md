# CS-73 — Test Case Specification (IS212 / IEEE 829)

Acceptance source: current Jira CS-73; Definition of Done CI/review requirements. Test evidence comes from actual GitHub runs and verified repository configuration, not synthetic green statuses.

| Test Case ID | Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Date of Creation |
|---|---|---|---|---|---|---|
| TC-CS73-01 | Complete application checks | Fresh GitHub runner, locked source, isolated service PG databases | Push implementation/PR; inspect every frontend/service/live/gate job and artifacts | Production source; synthetic accounts | Build/type/static and automatic tests pass; PG migrations/API tests and per-app coverage artifacts exist | 2026-10-07T02:38:37+00:00 |
| TC-CS73-02 | Failed tests reject CI | Deliberate requirements-owned RED regressions committed before fixes | Inspect run37555035857, failing Auth/Venue logs and aggregate gate | Missing role union, hours ordering and signup behavior | Failed application tests propagate through tee with pipefail; aggregate gate fails | 2026-10-07T02:38:37+00:00 |
| TC-CS73-03 | Required main gate and post-merge execution | Independent approval and reviewed squash merge | Read protection/settings and YAML triggers; after approved merge inspect main run | Exact Sprint2checks GitHub application context | Strict required check and one approval; main push launches all checks after merge | 2026-10-07T02:38:37+00:00 |

Post-merge main execution remains Not Executed while the PR is open. Configuration verification and passing branch/PR runs do not substitute for main merge-commit evidence.
