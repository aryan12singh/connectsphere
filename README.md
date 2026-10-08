# connectsphere
Event Planning and Venue Booking System for ConnectSphere Event Services. IS212 Software Project Management, AY2026/27 T1, Section G8.

## Documentation

- [Role and Event Access Matrix](docs/access-matrix.md) — which roles may view or change each protected resource, and known authorisation findings.
- [Definition of Done](docs/DEFINITION_OF_DONE.md) — criteria every user story must satisfy before it is accepted.
- [How to run and test](docs/how-to-run-and-test.md) — start the system from a clean clone and the manual test cases.
- [Sprint 2 event workflow delivery](docs/sprint2/event-request-delivery.md) — implemented stories, verification, CI and remaining review gates.
- [Isolated Sprint 2 review](docs/event-review-run.md) — Node 22, a fresh PostgreSQL 16 project, configurable ports and real live-auth/restart checks.
- [Auth setup](docs/auth-setup.md) — how login, roles/permissions and the tech support admin API work.
- [Event workflows and API mapping](docs/event-workflows.md) — persistence, transactions and request/Event history.
- [Event workflow decisions](docs/event-workflow-decisions.md) — contract choices requiring team/customer review.
- [Venue data model](docs/venue-data-model.md) — authoritative running tables, consultation review and remaining schema gaps.
- [Venue policy decisions](docs/venue-policy-decisions.md) — pending Week 7 choices and affected stories.
- [Hold expiry and occupied windows](docs/hold-expiry.md) — reusable timing code, isolated PostgreSQL spike and its integration limits.
- [Development log](docs/devlogs/DEVLOG.md) — decisions, verified progress and next dependencies, newest first.

## Run it locally

Needs Docker Desktop and Node.js 22 for the verified locked workflow.

```bash
# 1. Backend: Postgres, Keycloak, Kong, user-service, auth-service
docker compose -f infra/docker-compose.yml up --build -d

# 2. Seed data (once) — see docs/how-to-run-and-test.md, step B2

# 3. Website
cd frontend
npm ci
cp .env.example .env        # Windows: copy .env.example .env
npm run dev                 # http://localhost:3000
```

Full steps, seed users and test cases: [docs/how-to-run-and-test.md](docs/how-to-run-and-test.md). Use the [isolated review recipe](docs/event-review-run.md) when testing migrations, synthetic fixtures or failure triggers.

## Sprint 2 identity, venue and CI verification

The existing event-workflow delivery now includes CS-10/CS-26 identity completion and CS-33/CS-34 venue repairs. [Delivery evidence](docs/sprint2/event-request-delivery.md), [access matrix](docs/access-matrix.md) and [auth setup](docs/auth-setup.md) describe the current behavior. Public signup supports Organiser (organisation required) and Attendee; internal roles remain seed-only. All five role homes work, and multi-role accounts switch in the account menu without a second login.

Use Node 22 and locked `npm ci` installs. Each service owns its PostgreSQL database; create disposable test databases only and apply migrations before integration checks. Auth/User/Venue/Booking tests refuse a database other than their matching `<service>_test` name. From each service folder:

```bash
npm ci
npx prisma generate
# Set DATABASE_URL to the isolated service's *_test database first.
npx prisma migrate deploy
npm run test:coverage
npm run test:integration
# Venue/Booking also have HTTP contract checks:
npm run test:contract
```

Auth requires the same Keycloak/User/internal-key environment names as `.env.example`; its isolated API suite fixtures the external identity services while testing real PostgreSQL sessions/grants. User integration needs `INTERNAL_API_KEY`. Event `test:coverage` already includes its PostgreSQL API suite. For Venue/Booking unit and Python contract fixtures use their checked-in default private test key; hosted credentials must not be used.

Frontend checks use an isolated migrated event database plus explicit fixture authentication. From `frontend/`:

```bash
npm ci
npm run typecheck
npm run typecheck:e2e
# DATABASE_URL points only at the isolated event test database.
NUXT_AUTH_MODE=mock npm run test:coverage
NUXT_AUTH_MODE=live npm run build
```

The [full browser runner](docs/event-review-run.md) builds a fresh Keycloak/User/Auth/Kong/PostgreSQL stack, exercises desktop/mobile and restarts without reseeding. JSON/HTML/coverage output belongs in CI artifacts or outside the checkout; selected dated Markdown records remain in `tests/records`. No numerical coverage gate is invented before the planned Sprint 3 threshold.

[The workflow](.github/workflows/event-workflows.yml) has separate frontend and five service checks, real PostgreSQL migrations/API tests, per-app source coverage artifacts and a live E2E job. Booking also runs the isolated CS-78 expiry/concurrency spike. Its required aggregate `Sprint 2 checks` rejects failed or skipped prerequisites. Explicit Bash/pipefail preserves test exit statuses through `tee`. It runs for PRs and pushes to `feat/aryan-sprint2-event-workflows`, `feat/aryan-sprint3-venue-safety` and `main`; a main run requires the reviewed PR to be merged. Independent approval, squash merge and green CI on that merge remain delivery gates.
