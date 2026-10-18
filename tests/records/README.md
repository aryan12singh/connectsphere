# Test records

Start with [PR #13](https://github.com/aryan12singh/connectsphere/pull/13) for
the current review and checks. Each story folder contains its case specification
and selected dated executions. Read each report's source revision, actual result
and test layer; a filename alone does not establish a pass.

## Verified functional checkpoint

Source `ac9a38f`, including main `344bcd3`:
[all 10 hosted jobs passed](https://github.com/aryan12singh/connectsphere/actions/runs/39044671915).
Frontend 387; native unit 268; PostgreSQL 76; authenticated desktop/mobile 80;
live smoke 11; retained-data restart 1. Both typechecks, production build,
14 independent service coverage suites and five gate controls passed.
Browser tests had zero retries, skips or flaky cases.

[Raw reports and source/hash manifest](https://drive.google.com/file/d/1E7PnzyNkuSEikIbz1UtH24AzfVMUiHft/view)
support that checkpoint. The [shared case sheet](https://docs.google.com/spreadsheets/d/1V7Hkl3rjEqGSht5HLrfLYVJlZKbwBkL2qEh0S0YF1C8/edit#gid=1620063509)
links 81 owned scenarios and their original UI/database previews. Screenshots
retain their actual capture revision. Manual/PO acceptance and peer review remain
separate gates recorded on Jira.

## Selected Sprint 3 records

These local records preserve the dated development milestones; the full combined
execution above supplies the later integrated verification.

| Story | Case specification | Selected execution |
| --- | --- | --- |
| CS-36 search | [Cases](CS-36/test-cases.md) | [Frontend boundaries](CS-36/test-runs/2026-10-17T05-48-54Z-GREEN-FRONTEND.md) |
| CS-37 holds | [Cases](CS-37/test-cases.md) | [Q2 reconciliation](CS-37/test-runs/2026-10-17-Q2-GREEN.md) |
| CS-38 decisions | [Cases](CS-38/test-cases.md) | [Q2 and PostgreSQL](CS-38/test-runs/2026-10-17-Q2-GREEN.md) |
| CS-39 conflicts | [Cases](CS-39/test-cases.md) | [Live and boundary checks](CS-39/test-runs/2026-10-17T05-48-54Z-GREEN-LIVE.md) |
| CS-78 clock spike | [Cases](CS-78/test-cases.md) | [Isolated PostgreSQL spike](CS-78/test-runs/2026-10-08T16-49-22Z-GREEN-POSTGRES.md) |
| CS-79 coverage | [Cases](CS-79/test-cases.md) | [Floors and rejection controls](CS-79/test-runs/2026-10-17-COVERAGE-GREEN.md) |
| CS-84 buffers | [Cases](CS-84/test-cases.md) | [Live and boundary checks](CS-84/test-runs/2026-10-17T05-48-54Z-GREEN-LIVE.md) |
| CS-85 hours | [Cases](CS-85/test-cases.md) | [Reproduced defect](CS-85/test-runs/2026-10-17-HOURS-RED.md), [corrected result](CS-85/test-runs/2026-10-17-HOURS-GREEN.md) |
| CS-86 rechecks | [Cases](CS-86/test-cases.md) | [Frontend boundaries](CS-86/test-runs/2026-10-17T05-48-54Z-GREEN-FRONTEND.md) |
| CS-87 rooms | [Cases](CS-87/test-cases.md) | [Frontend boundaries](CS-87/test-runs/2026-10-17T05-48-54Z-GREEN-FRONTEND.md) |
| CS-93 submission | [Cases](CS-93/test-cases.md) | [Live and boundary checks](CS-93/test-runs/2026-10-17T05-48-54Z-GREEN-LIVE.md) |
| CS-94 review | [Cases](CS-94/test-cases.md) | [Frontend boundaries](CS-94/test-runs/2026-10-17T05-48-54Z-GREEN-FRONTEND.md) |
| CS-95 rework | [Cases](CS-95/test-cases.md) | [Live and boundary checks](CS-95/test-runs/2026-10-17T05-48-54Z-GREEN-LIVE.md) |

## Retention

Keep case specifications, substantive RED/failed attempts, policy milestones and
important passing results for each test layer. Raw JSON, screenshots, coverage
and repetitive outputs belong in CI artifacts or the agreed shared evidence
location. See the [Definition of Done](../../docs/DEFINITION_OF_DONE.md).

The 18 October cleanup removes 53 successful reruns whose executed case/result
tuples are covered by a later retained run at the same stated layer. Seven
zero-execution copies share one source, timestamp and layer; their
[representative failed-attempt diagnostic](CS-36/test-runs/2026-10-13T11-06-26Z-GREEN-attempt-failed.md)
remains. Every genuine failed assertion, policy milestone, handwritten report
and native/database/browser result is retained.

The [complete pre-cleanup record tree](https://github.com/aryan12singh/connectsphere/tree/ac9a38f7960940a389eb52ed590fd7a0d4e4bd59/tests/records)
preserves the original paths and dated provenance in Git history. New runs are
kept when they add meaningful coverage, demonstrate a defect/fix or verify a
changed policy; successful reruns do not each need another committed file.
