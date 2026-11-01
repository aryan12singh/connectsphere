# connectsphere
Event Planning and Venue Booking System for ConnectSphere Event Services. IS212 Software Project Management, AY2026/27 T1, Section G8.

Release 1 covers the 20 core features from the Week 4 project instructions and the six Week 7 customer changes: event requests from draft to completion, Lead-controlled Coordinator assignment, venue search and booking with setup/turnaround buffers, multiple venues per Event, expiring holds, venue unavailability and replacement, equipment, the Safety Officer check, attendee registration and withdrawal, changes and cancellation, and notifications.

## Architecture

- **Frontend:** Nuxt 4 / Vue 3 / TypeScript with a server-side BFF (sealed-cookie session).
- **Gateway and identity:** Kong 3.6 routes the public APIs; Keycloak 26 is the password authority.
- **Services:** auth, user, event, venue, booking, equipment, attendance and notification. Each is Express 5 + Prisma 6 with its own PostgreSQL 16 database; services call each other only through private `/internal` APIs.
- **Messaging:** RabbitMQ with a transactional outbox in each producer and a deduplicating inbox in notification-service.
- **Roles:** Event Organiser, Event Coordinator, Event Coordinator Lead, Venue Staff, Technical Support Staff, Safety Officer and Attendee.

See the [architecture overview](docs/connectsphere-architecture.md).

## Documentation

- [Definition of Done](docs/DEFINITION_OF_DONE.md) and [role and event access matrix](docs/access-matrix.md).
- [How to run and test](docs/how-to-run-and-test.md): start from a clean clone, seed users and the manual test cases.
- [Customer and PO decisions](docs/session3-decisions.md) and [venue policy decisions](docs/venue-policy-decisions.md).
- [API contract](docs/api-contract.md), [event workflows](docs/event-workflows.md) and [event workflow decisions](docs/event-workflow-decisions.md).
- [Venue data model](docs/venue-data-model.md), [hold expiry](docs/hold-expiry.md) and [Safety UI](docs/safety-ui.md).
- [Service integration and RabbitMQ contract](docs/sprint3-integration-handoff.md).
- [Coverage policy](docs/coverage-policy.md), [Sprint 4 venue test map](docs/sprint4-venue-test-map.md) and [story test records](tests/records/README.md).
- [Isolated live review](docs/event-review-run.md) and the [development log](docs/devlogs/DEVLOG.md).

## Run it locally

Needs Docker Desktop and Node.js 22.

```bash
# 1. Backend: PostgreSQL, Keycloak, Kong, RabbitMQ and every service
docker compose -f infra/docker-compose.yml up --build -d

# 2. Seed data (once)
docker compose -f infra/docker-compose.yml run --rm seed

# 3. Website
cd frontend
npm ci
cp .env.example .env        # Windows: copy .env.example .env
npm run dev                 # http://localhost:3000
```

Seed users, useful addresses and troubleshooting are in [docs/how-to-run-and-test.md](docs/how-to-run-and-test.md).

## Tests

Use Node 22 and locked `npm ci` installs. Integration suites refuse any database other than their own `<service>_test`. From each service folder:

```bash
npm ci
npx prisma generate
# Point DATABASE_URL at the service's *_test database first.
npx prisma migrate deploy
npm run test:coverage
npm run test:integration
npm run test:contract       # Venue, Booking, Event and Notification
```

From `frontend/`:

```bash
npm ci
npm run typecheck
npm run typecheck:e2e
NUXT_AUTH_MODE=mock npm run test:coverage
NUXT_AUTH_MODE=live npm run build
```

The [live review runner](docs/event-review-run.md) builds a fresh stack, runs the desktop and mobile browser journeys and restarts without reseeding. Coverage floors are 65% statements/lines/functions and 60% branches for the frontend, plus per-service unit and PostgreSQL floors; a command below its floor fails.

## Continuous integration

[The workflow](.github/workflows/event-workflows.yml) runs on every pull request and on pushes to `main`:

- frontend checks and one job per service, each with real PostgreSQL migrations and coverage;
- **Live E2E and restart checks:** host PostgreSQL suites, bus, Safety and maintenance acceptance, and a restart without reseeding;
- **Live browser journeys (1/4–4/4):** the Playwright desktop and mobile suite in four shards, each on its own fresh stack;
- the aggregate **Sprint 2 checks** gate, which fails if any job failed or was skipped.

Changes reach `main` through a reviewed, squash-merged pull request with green checks.
