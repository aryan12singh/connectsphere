# CS-79 — Coverage Gate Execution Record

Yellow section. Executed 2026-10-17T16:28:51.008991+08:00 (Asia/Singapore).

Source: `chore/cs79-coverage-gates` working tree based on main `7867f24`; Node 22.23.3, locked dependencies, isolated PostgreSQL 16. Exact hosted revision and evidence are recorded by the PR workflow.

| Case | Actual result | Layer | Status |
| --- | --- | --- | --- |
| TC-CS79-01 | Frontend 386/386, no failed/pending; statements 68.97%, lines 70.66%, branches 65.07%, functions 69.61%; configured floors pass | Actual frontend source coverage | PASS |
| TC-CS79-02 | All seven unit and seven PostgreSQL commands pass their separate floors; see measured values below | Native source coverage + actual PostgreSQL | PASS |
| TC-CS79-03 | One fixture assertion passes, nonempty report, exit 0 through Bash/tee | Actual native control | PASS |
| TC-CS79-04 | Assertion passes; 100% line floor returns1 through Bash/pipefail/tee | Actual native negative control | PASS (expected rejection) |
| TC-CS79-05 | Assertion passes; 100% branch floor returns1 through Bash/pipefail/tee | Actual native negative control | PASS (expected rejection) |
| TC-CS79-06 | Assertion passes; 100% function floor returns1 through Bash/pipefail/tee | Actual native negative control | PASS (expected rejection) |
| TC-CS79-07 | Real focused CS-78 frontend 17/17 passes, no failed/pending/setup suites; normal global floors reject with exit 1 and explicit coverage errors | Actual frontend/report-wrapper negative control | PASS (expected rejection) |
| TC-CS79-08 | Hosted execution is recorded by PR checks and its source-linked artifacts, separately from this local checkpoint | Hosted CI/fresh live stack | Not executed locally |

| Service | Unit tests | Measured lines / branches / functions | PostgreSQL tests | Measured lines / branches / functions |
| --- | ---: | --- | ---: | --- |
| auth-service | 23 | 75.70 / 74.62 / 60.00 | 4 | 59.87 / 70.91 / 29.82 |
| booking-service | 35 | 34.03 / 73.68 / 30.32 | 17 | 79.12 / 59.72 / 73.64 |
| equipment-service | 8 | 100.00 / 66.67 / 100.00 | 5 | 79.81 / 51.63 / 75.00 |
| event-service | 124 | 66.45 / 75.97 / 61.06 | 23 | 64.75 / 74.93 / 55.46 |
| notification-service | 21 | 82.42 / 64.10 / 82.05 | 4 | 67.41 / 52.31 / 65.45 |
| user-service | 6 | 70.26 / 75.00 / 53.33 | 5 | 81.30 / 59.57 / 60.00 |
| venue-service | 43 | 55.66 / 73.73 / 50.86 | 13 | 69.82 / 57.82 / 71.77 |

Both frontend typechecks and the production build pass. Existing contracts also pass (Event 2, Venue 11, Booking 14, Notification 12 and Equipment 8). Source scopes and configured floors are in [the policy](../../../../docs/coverage-policy.md); no cross-service or unit/PG aggregate is claimed.

Raw execution evidence: external `sprint3-evidence/2026-10-17-cs79-coverage`, `Local-Gated-Verification.json`, service `*-gated-*.log`, `frontend-gated*` and `proof-local-v2`. CI retains equivalent reports in its existing service/frontend artifacts, including the separate coverage-gate-proof directory.

Diagnostic history: the initial external Venue harness key mismatch and the first proof-harness report-field mismatch are retained separately. Corrected runs pass; no assertion, threshold or source filter was weakened to clear either diagnostic. This record does not claim a pre-implementation RED run, human acceptance, a merged policy PR or green post-merge main CI.
