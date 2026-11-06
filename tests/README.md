# Tests

ConnectSphere is tested at four layers. Each layer catches a different kind of fault, so a story usually appears in more than one. The [traceability index](../docs/testing/test-traceability.md) maps every story to its specified cases and to each test file that covers it.

| Layer | Where | Runner | What it proves | Runs in CI as |
|---|---|---|---|---|
| Service unit and HTTP contract | `services/<service>/tests/unit` (auth and user: `services/<service>/tests/*.test.js`), `tests/test_*.py` | `node --test`, `unittest` | Domain rules, validation, permissions and each service's HTTP contract, with dependencies stubbed | one job per service (`event-service`, `booking-service`, …) |
| Service integration | `services/<service>/tests/integration` (attendance also `tests/postgres`) | `node --test` against the service's own `<service>_test` PostgreSQL database (attendance's `tests/integration` runs in memory) | Real migrations, transactions, locking, outbox and concurrency (for example two expiry scans at once) | the same per-service jobs |
| Frontend unit, component and BFF | `tests/specs` | Vitest with the Nuxt test environment | Pages and components render the right states; BFF routes call event-service and enforce access; runs in seconds without a browser | `Frontend` |
| Live end-to-end | `frontend/e2e` | Playwright, desktop and mobile | Full journeys through the browser, Kong, Keycloak, RabbitMQ and every service on a freshly seeded stack, including restarts | `Live stack integration and restart`, `Live browser journeys (shard n/4)` |

`tests/specs` and `frontend/e2e` share story names but are not duplicates. A spec mounts one page or calls one BFF route with stubbed neighbours, so it can cover every branch, error and boundary quickly. An e2e journey drives the real stack end to end and is slower, so it covers the main paths across services.

## Supporting folders

- `tests/helpers`: shared fixtures and harnesses (the event-service BFF harness, live Safety, venue and notification helpers).
- `services/utils/*.test.js`: the shared outbox retry schedule, run in the `Frontend` job with the test-script tests.
- `tests/scripts`: runner guards, the coverage wrapper and coverage-gate proof, `validate-equipment-traceability.cjs` (checks that the CS-40/41/42/47 records' declared layers match the browser tests; runs in CI) and `traceability-index.mjs`, which regenerates the traceability index.
- `tests/records/<story>`: the written case specification (`test-cases.md`) and dated execution reports (`test-runs/`). Case IDs (`TC-CSnn-xx`) match the Sprint test sheet and appear in the test names, so a case can be found in code with a text search.

## Running

See the root [README](../README.md#tests) for commands and [how to run and test](../docs/guides/how-to-run-and-test.md) for the full live stack. After adding or renaming tests, regenerate the index from the repository root:

```bash
node tests/scripts/traceability-index.mjs
```

Coverage floors are in the [coverage policy](../docs/testing/coverage-policy.md).
