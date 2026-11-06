# Documentation

Project documentation, grouped by what you need it for. The [root README](../README.md) is the starting point. This page is the map of everything under `docs/`.

| Folder | Read it when you want to… | Main files |
|---|---|---|
| [`guides/`](guides) | run the system or a test environment | [How to run and test](guides/how-to-run-and-test.md) · [Isolated live review / Playwright runner](guides/event-review-run.md) · [Auth setup](guides/auth-setup.md) |
| [`architecture/`](architecture) | understand how the system is built | [Architecture overview](architecture/connectsphere-architecture.md) · [API contract](architecture/api-contract.md) · [Role and event access matrix](architecture/access-matrix.md) · [Event workflows](architecture/event-workflows.md) · [Frontend BFF for venues and bookings](architecture/frontend-bff-venue-booking.md) · [Venue data model](architecture/venue-data-model.md) · [Safety UI](architecture/safety-ui.md) |
| [`decisions/`](decisions) | know why something works the way it does | [Customer and PO decisions (Session 3)](decisions/session3-decisions.md) · [Event workflow decisions](decisions/event-workflow-decisions.md) · [Venue policy decisions](decisions/venue-policy-decisions.md) · [Hold expiry spike](decisions/hold-expiry.md) |
| [`testing/`](testing) | find which test covers a story, or the coverage rules | [Test traceability index](testing/test-traceability.md) (generated) · [Coverage policy](testing/coverage-policy.md) · [Sprint 4 venue test map](testing/sprint4-venue-test-map.md) |
| [`process/`](process) | know when a story counts as done | [Definition of Done](process/DEFINITION_OF_DONE.md) |
| [`sprints/`](sprints) | read sprint-specific delivery notes and acceptance guides | [Sprint 2](sprints/sprint2) · [Sprint 3](sprints/sprint3) (including the [service integration and RabbitMQ handoff](sprints/sprint3/integration-handoff.md)) · [Sprint 4](sprints/sprint4) |
| [`devlogs/`](devlogs) | follow the history of the work | [Development log](devlogs/DEVLOG.md), plus one dated report per major phase |
| [`archive/`](archive) | see superseded material, kept for history | [What is archived and why](archive/README.md) |

## Documentation elsewhere

- **API reference per service:** each service has `swagger.html` or `docs/openapi.yaml`. auth-service also serves Swagger UI at http://localhost:3002/docs while the stack runs.
- **Tests:** [tests/README.md](../tests/README.md) explains the four test layers. [tests/records](../tests/records/README.md) holds each story's case specification and dated runs.
- **Data models:** the real schema of each service is in `services/<service>/prisma/schema.prisma`.

## Keeping this tidy

- **Placing new documents:** put them in the folder whose purpose fits, and link them from this page.
- **Moving documents:** after moving one, update its links. The test traceability index is generated: run `node tests/scripts/traceability-index.mjs` from the repository root instead of editing it by hand.
