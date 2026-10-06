# connectsphere
Event Planning and Venue Booking System for ConnectSphere Event Services. IS212 Software Project Management, AY2026/27 T1, Section G8.

## Documentation

- [Role and Event Access Matrix](docs/access-matrix.md) — which roles may view or change each protected resource, and known authorisation findings.
- [Definition of Done](docs/DEFINITION_OF_DONE.md) — criteria every user story must satisfy before it is accepted.
- [How to run and test](docs/how-to-run-and-test.md) — start the system from a clean clone and the manual test cases.
- [Isolated Sprint 2 review](docs/event-review-run.md) — Node 22, a fresh PostgreSQL 16 project, configurable ports and real live-auth/restart checks.
- [Auth setup](docs/auth-setup.md) — how login, roles/permissions and the tech support admin API work.
- [Development log](docs/development-log/dev-log.md) — decisions and progress, newest first.

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

Full steps, seed users and test cases: [docs/how-to-run-and-test.md](docs/how-to-run-and-test.md).


Sprint 2 persistent request implementation: [workflow and BFF mapping](docs/event-workflows.md), [isolated clean-checkout review recipe](docs/event-review-run.md), and [decisions requiring acceptance](docs/event-workflow-decisions.md). Use the isolated recipe when testing migrations, synthetic fixtures or failure triggers.
