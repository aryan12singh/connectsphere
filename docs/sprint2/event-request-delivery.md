# Sprint 2 integrated delivery and review

Branch `feat/aryan-sprint2-event-workflows`; [PR #7](https://github.com/aryan12singh/connectsphere/pull/7) targets `main`. Persistent forms, identity and venue features run through production Nuxt/BFF, Kong, live Keycloak, five owning services and PostgreSQL.

## Implemented scope

| Story / task | Observable result | Review entry point |
|---|---|---|
| CS-11 | Complete fields/registration, validation/receipt, owner reopening, read-only submission, concurrent duplicate protection, transactional assignment/activity/outbox | [Cases](../../tests/records/CS-11/test-cases.md), Event workflows/form/BFF |
| CS-29 | Incomplete private Draft, same-ID resume/submit, unsaved Stay/Leave, saved version and input retained after failed writes | [Cases](../../tests/records/CS-29/test-cases.md) |
| CS-27 | Returned comments, valid changed amendment, same ID/Coordinator on resubmit, revision timestamp and old/new history | [Cases](../../tests/records/CS-27/test-cases.md) |
| CS-44 | Authorised append-only Request and distinct Event history, private-Draft redaction, actor/time/old-new values, pagination and keyboard tabs | [Cases](../../tests/records/CS-44/test-cases.md) |
| CS-10 (Marc) | All five functional homes, denied unknown roles, sealed role switching without relogin, fresh grant removal, exact idle/absolute expiry and logout | [Cases](../../tests/records/CS-10/test-cases.md), Auth session service, account menu/middleware |
| CS-26 (Marc) | Organiser/Attendee signup, field guidance, concurrent transactional organisation resolution, seed-only staff roles, specific action-role/capability intersection and owner/current-assignment guards | [Cases](../../tests/records/CS-26/test-cases.md), Auth/User services, signup and booking assignment proof |
| CS-33 (Alan) | Ordered operating hours on create/full edit/hours edit; invalid values return 422 without venue/history changes | [Cases](../../tests/records/CS-33/test-cases.md), Venue validator/routes |
| CS-34 (Alan) | Venue-zone day/week ranges, early local Monday, midnight clipping/splitting, 23/25-hour DST days, invalid local input guidance and Technical Support read-only calendar | [Cases](../../tests/records/CS-34/test-cases.md), calendar state/component |
| CS-15 / CS-73 | Separate application tests, real PG APIs/migrations, per-app source coverage, live E2E/restart, propagated failure and required main gate | [CI](../../.github/workflows/event-workflows.yml), [cases](../../tests/records/CS-15/test-cases.md) |

Teammate ownership remains unchanged. These are implementations and automated evidence ready for their review; Jira status alone is not evidence of acceptance.

Coordinator booking creation/detail/edit/list/history now asks Event service for the actual Event's current assignment using the verified caller token. Foreign/revoked assignment returns 403; dependency failure returns 503 before writes/history. Ownership still applies. Venue Staff decisions and explicit BLOCKED/UNAVAILABLE windows retain their own permission path. Technical Support receives only `venues.view` through an additive migration. No shared database reads or new staff provisioning endpoint were introduced.

The [workflow/ERD/BFF map](../event-workflows.md), [identity/venue C4 and class views](../connectsphere-architecture.md), [OpenAPI](../../services/event-service/docs/openapi.yaml), [access matrix](../access-matrix.md), [auth setup](../auth-setup.md), [venue contract](../frontend-bff-venue-booking.md) and [decisions](../event-workflow-decisions.md) describe the contracts. Static role policy is bundled into each dependent service image; test helpers stay outside production images.

## Verification

The deliberate RED PR [run 37555035857](https://github.com/aryan12singh/connectsphere/actions/runs/37555035857) failed Auth/User/Venue/Frontend and the aggregate gate. It establishes that explicit Bash/pipefail preserves failed test statuses through `tee`; an earlier run exposed that bug. Application source `d3fd88c0719fb79434677d6fa623d23a93cb4c23` passed all eight jobs in [PR run 37564801571](https://github.com/aryan12singh/connectsphere/actions/runs/37564801571). The latest publication checks and artifacts are available on [PR #7 checks](https://github.com/aryan12singh/connectsphere/pull/7/checks); the subsequent gateway readiness adjustment is included there.

| Layer | Local result | Scope |
|---|---|---|
| Frontend | 130/130; app and browser-test typechecks pass | Components, pure action matrix and real H3/BFF/PG boundaries with fixture identity |
| Auth | 23 unit/boundary + 4 PG | Session hashing/expiry/grants, real endpoints, only external identity/profile collaborators fixtured |
| User | 6 unit/boundary + 5 PG | Signup/profile/organisation transactions, eight concurrent profiles, rollback and directory |
| Event | 132/132 | 112 unit/domain/harness + 20 real PG APIs, including current-assignment proof |
| Venue | 43 unit + 11 HTTP + 3 PG | Hours/authorization, mutation/history persistence |
| Booking | 35 unit + 14 HTTP + 5 PG | Staff decisions, current-assignment scope, revocation and dependency rollback |
| Live browser | 46/46; no skips, failures or reruns | 23 desktop + 23 mobile Chromium cases, retries disabled |
| Live API / restart | 11/11; restart 1/1 in CI and two additional local cycles | Actual Keycloak/Kong/BFF/PG, retained IDs/history after six services restart without reseeding |

The local 46-case run passed before a transient 404 interrupted its immediate restart login. The same retained volume then passed the restart check; after tightening gateway DNS to 1-second validity with no stale records and requiring two healthy BFF/gateway samples, two successive six-service restarts passed. No business writes or assertions are retried. A fresh full run of the published configuration is recorded in the latest CI artifacts.

Measured source-only line/branch/function coverage is Frontend 73.93/65.67/66.76%, Event 97.68/91.85/92.47%. Separate unit and PG coverage artifacts are uploaded for Auth, User, Venue and Booking; their figures must not be added together. Coverage excludes test files and is not comparable to the earlier inflated reports that included them. Unexecuted branches and later workflows remain visible; no threshold is claimed ahead of the Sprint 3 agreement.

Selected meaningful RED, latest GREEN/service/browser execution records remain under [tests/records](../../tests/records). Missing cases remain Not Executed at that layer. Node records distinguish real Express/PG handlers from external dependency fixtures; live browser records identify actual Keycloak/Kong. Raw JSON/HTML/logs, intermediate diagnostics and repeated records are retained in CI artifacts or the agreed external project evidence folder, outside the source checkout. Existing main records and all requirements-owned test cases remain intact.

## CI and reproduction

[The workflow](../../.github/workflows/event-workflows.yml) runs on PRs, pushes to main/the feature branch and manual dispatch. Node 22, locked installs, Ubuntu24.04 and PostgreSQL 16 are explicit. Frontend and each of the five services have separate jobs; database jobs migrate their own isolated databases and test actual API handlers. The live job builds a clean production stack and verifies browser/retained-ID restart behavior. Auth/User now have dedicated unit and PG suites. Per-app coverage and all failed-run evidence are uploaded for 30 days.

The final `Sprint 2 checks` job runs even when prerequisites fail and rejects failure, skip or cancellation. Main requires this exact GitHub Actions check with an up-to-date branch and one independent approval; administrators are subject to it. Repository settings allow squash only and use PR title/body for the squash message. Auto-merge remains disabled. Main push CI will run after the reviewed PR merges; the branch does not bypass that gate. Follow the [clean-checkout recipe](../event-review-run.md) and README for reproduction.

## Remaining acceptance and scope

Apply the [Definition of Done](../DEFINITION_OF_DONE.md): Aryan reads/explains the code; another developer executes acceptance/manual cases and reviews it; squash merge, green main CI and PO acceptance then complete delivery. Automated checks do not meet those human gates. Alan/Marc should review their amended behavior and retained test cases, while Javier reviews assignment fairness and shared workflow integration.

Confirm C02's venue/layout wording and CS-44's example activity count in the [decision record](../event-workflow-decisions.md). Approval creates Planning, not Confirmed. Notification outbox persistence is implemented; delivery/relay belongs to CS-50. CS-30 reassignment/Planning decisions, confirmation UI and global team acceptance/design completion remain separate work. Completed/Cancelled history uses persisted fixtures; those transitions are not added here.

Organisation membership follows the current self-declared signup contract: the server resolves exact trimmed names. Verified/invited affiliation requires a separate product decision. The last source dependency audit retained23 inherited frontend findings (5 moderate,11 high,7 critical); functional CI does not resolve them, and no forced framework upgrade was made.

Week7 buffers, replacement notifications, multiple venues, expiring holds, Lead assignment and safety review remain next-sprint planning scope. Instructor access evidence is deferred to the agreed final stage.
