# Sprint 2 event request delivery

CS-11, CS-27, CS-29 and CS-44 have working application code on `feat/aryan-sprint2-event-workflows`. Requests, versions, assignments, history and operation replay are stored in PostgreSQL. Existing forms call the Nuxt BFF, Kong and event-service; no in-memory request fallback remains.

## Implemented stories

| Story | Delivered behaviour | Test cases |
|---|---|---|
| CS-11 | Complete fields/registration, shared validation, unique ID/receipt, owner reopening, read-only submission, concurrent duplicate protection, transactional assignment/activity/outbox | [Cases](../../tests/records/CS-11/test-cases.md) |
| CS-29 | Incomplete private Draft, same-ID resume/submit, unsaved Stay/Leave, saved version and typed input retained after failed writes | [Cases](../../tests/records/CS-29/test-cases.md) |
| CS-27 | Returned comments, valid changed amendment, same ID/Coordinator on resubmit, revision timestamp and old/new history | [Cases](../../tests/records/CS-27/test-cases.md) |
| CS-44 | Authorised append-only Request and distinct Event history, private-Draft redaction, actor/time/old-new values, pagination and keyboard tabs | [Cases](../../tests/records/CS-44/test-cases.md) |

Supporting changes enforce trusted effective permissions before record/replay access, safe 10 KB JSON parsing, ordinary booking creation permissions while retaining staff operational windows, and deterministic startup/port diagnostics. Browser hydration and date round trips have regression coverage. Notification outbox persistence is implemented; delivery/relay belongs to CS-50.

The [workflow sequence, ERD and BFF mapping](../event-workflows.md), [OpenAPI](../../services/event-service/docs/openapi.yaml), [access matrix](../access-matrix.md) and [decision record](../event-workflow-decisions.md) describe the contract. Start source review with the [workflow orchestrator](../../services/event-service/src/workflows.js), shared validator/transition guard, request BFF handlers, form and history pages.

## Verification

Application revision `d70b1cefc9418e4a44e1588481fa28ab76ba95a4` passed [CI run 37522678737](https://github.com/aryan12singh/connectsphere/actions/runs/37522678737). The subsequent documentation/record publication `0f3b1db6b7733e5ea712fd0beb1ec38430ec6f84` independently passed [run 37524638714](https://github.com/aryan12singh/connectsphere/actions/runs/37524638714). New revisions require their own [branch/PR checks](https://github.com/aryan12singh/connectsphere/actions?query=branch%3Afeat%2Faryan-sprint2-event-workflows).

| Check | Verified result | Scope |
|---|---|---|
| Frontend | 111/111; typecheck and production build pass | Story components and real H3/BFF boundaries with fixture identity |
| Event service | 131/131 | 112 unit/domain/harness and 19 real PostgreSQL integration tests; build and migrations |
| Venue service | 52/52 | 42 unit and 10 HTTP contracts |
| Booking service | 48/48 | 34 unit and 14 HTTP contracts |
| Production browser | 22/22; zero failures, skips, flaky cases or reruns | Desktop/mobile Chromium; live Keycloak/Kong/BFF/PostgreSQL, actual service outage and recovery |
| Live API / restart | 11/11 and 1/1 | Effective-grant removal/restoration; same IDs/history after six application services restart without reseeding |

Selected RED, GREEN and browser execution records remain in each [story folder](../../tests/records). Full JSON/HTML/logs are CI artifacts, rather than source files. Earlier diagnostic runs and removed duplicate reports remain recoverable in Git history and the external project handoff archive. Existing records inherited from main are preserved. HTTP transport cases have separate dated records because the Vitest collector does not execute Node service tests.

Measured Node lines/branches/functions coverage was Event 98.97/93.26/96.40%, Venue 82.42/90.04/78.67% and Booking 79.57/90.64/78.29%. These aggregates include test files and startup-imported routes; Python coverage is separate and no frontend percentage is claimed. The team's coverage threshold is scheduled for Sprint 3.

## CI and reproduction

[The workflow](../../.github/workflows/event-workflows.yml) runs on PRs, main and the feature branch with Node 22, locked installs, PostgreSQL 16 and independent databases. Frontend, Event, Venue and Booking checks are separate. Auth/User each validate JavaScript, Prisma and application imports; their real authentication/profile integration is exercised by the live job. Dedicated Auth/User unit suites remain an ownership gap. The final `Sprint 2 checks` job fails if any prerequisite fails or is skipped, providing a single branch-protection gate alongside independent review.

Artifacts retain component JSON, dated execution records, service coverage logs, production browser reports and service/restart logs for 30 days, including failed runs. Downloads can be retained in the agreed project evidence location. The [isolated clean-checkout recipe](../event-review-run.md) reproduces the real browser, authentication and restart checks without using an existing team's database.

## Remaining acceptance and scope

Follow the [Definition of Done](../DEFINITION_OF_DONE.md): Aryan must read/explain the code; another developer must verify the acceptance criteria and manual cases; the PR needs approval, squash merge, green main CI and PO acceptance. The four stories remain In Progress until those gates are met. Automated results do not establish that every teammate Sprint 2 issue is complete.

Confirm C02's venue/layout interpretation and CS-44's example activity count using the [decision record](../event-workflow-decisions.md). Assignment fairness uses the existing selector with least-recently-assigned ties and needs Javier's review. Completed/Cancelled history is verified with persisted fixtures; later transition/reassignment endpoints are separate work.

The last source dependency audit reported 23 inherited frontend findings (5 moderate, 11 high, 7 critical), reduced from 29 by compatible patches. Functional CI does not resolve those findings or substitute for a release dependency review. Broader CS-26 role administration, multi-role permission union, confirmation UI and the calendar boundary issues belong to their owners.

Week 7 changes remain future planning scope: buffers, affected-booking notifications/replacement, multiple venues, expiring holds, Lead assignment and safety review. Map them by requirement title; the planning document's proposed CS-50 conflicts with the live notification issue. Instructor access evidence is deferred until the agreed final stage.
