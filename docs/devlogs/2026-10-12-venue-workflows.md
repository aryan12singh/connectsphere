# Sprint 3 venue workflows — 12 October 2026

## Delivered phase

Branch: `feat/aryan-sprint3-venue-safety`. Main `52687d2` is integrated through local merge `0b35296`; the preceding published foundation is `8ee8ce7`. This phase implements production UI, HTTP handlers and additive PostgreSQL migrations, and is ready for team vetting after branch CI. It does not close the stories or open a PR.

- CS-84/85: fixed Venue Staff setup/turnaround controls, zero-compatible migration, versioned edits, full occupied-window opening/suitability checks, shared search/write/calendar timing, buffer shading and expiry visibility.
- CS-36/37/38/39: current-Coordinator search, independent versioned tentative room holds with persisted deadlines, stable request replay, guarded Staff approval/rejection/extensions, atomic room moves/releases, no conflict override, immutable activity and transactional intent.
- CS-86/87: preserve inherited bookings and set/clear current conflict flags after operational/configuration changes; durable private recheck retries; Event page lists every room and current outstanding/readiness state. Serialized catalogue deletion prevents an in-flight commitment from losing its venue.
- Event integration is one guarded read-only planning-context route. Known existing form labels map to catalogue codes in Booking; unknown needs remain unmet. Parent lifecycle and global role grants are unchanged.
- CS-74/76/96: model/API/policy documents and PM case mappings are current. Numerical and extension choices remain configurable working assumptions; shared customer answers are still blank.

The new UI follows existing components while Figma is delayed. Manual design/PO acceptance is still required. No equipment reservation, technical approval, Safety decision or whole-Event confirmation is fabricated.

## Verification

Node22.23.3, disposable PostgreSQL16, real service boundaries where stated. Final code/test/infra/API-document SHA256 (excluding generated records and project Markdown): `be5c17f61ef1ad90823438447ec9136f2a9c97a73953a4da802dc2aa29a700b3`.

| Layer | Actual result | Scope / limits |
| --- | --- | --- |
| Frontend full regression/coverage | 255/255, zero skipped | Includes 106 checks for CS-36/37/38/39/84/85/86/87; HTTP memory fixtures, Nuxt components/state, and existing request regressions. Source coverage is measured, not claimed complete. |
| Venue unit / HTTP contracts / PostgreSQL | 43/43 · 11/11 · 5/5 | PostgreSQL includes atomic buffer/version/history/intent, stale rejection, reconnect and invalid acknowledgement retry. |
| Booking unit / HTTP contracts / PostgreSQL | 35/35 · 14/14 · 10/10 | PostgreSQL includes one-winner parallel commitments/decisions, actual lock-wait expiry and rejected-intent rollback of booking/history/outbox. |
| Event route regression | 22/22 | Existing route/coverage suite plus the guarded planning projection in the story subset. |
| Hold persistence research spike | 10/10 | Disposable prototype tables: claim/lease fencing, warning/expiry deduplication, restart/catch-up and clock after lock wait. Not the production expiry worker. |
| Production stack | 11/11 smoke · 48/48 desktop/mobile · 1/1 restart | Real Nuxt/BFF/Kong/Keycloak/auth/PG16, synthetic accounts. Browser reruns disabled; zero flaky/skipped. Local full-stack snapshot precedes the final message-name and delayed-read clock refinements; those are covered by the final real-handler suite. Hosted branch CI checks the exact pushed revision. |
| Static/build | Frontend and browser typechecks pass; production Nuxt build passes; API documents parse with valid local references | Build runs in the production-stack runner. Latest complete revision is verified by hosted CI after publishing. |

Final local outputs are outside Git under `/tmp/connectsphere-s3-delivery-*`. Live evidence/screenshots: `/tmp/connectsphere-s3-phase2-live-final-20261012/evidence/`. The earlier failed browser attempt is retained under `/tmp/connectsphere-s3-phase2-live-20261012/evidence/`. Temporary schemas/containers are isolated from other projects; review runner stops its services and retains its project volume without reseeding.

Blue specifications and dated yellow records stay in `tests/records/CS-xx`. Source PM IDs were reconciled without changing recorded assertion outcomes/timestamps; original raw reports remain outside Git. Early fixture/import failures are diagnostic attempts, not valid behavioral RED proof. Accepted assignment/security assertions were retained. The former unrestricted Staff-status test was strengthened to the current CS-38/39 guarded-transition requirement; CS-26 browser setup now creates an eligible isolated room instead of depending on an unrelated first catalogue result.

Observed RED fixes include competing holds, missing expiry/intent, stale/unauthorized decisions, expiry during slow reads/lock waits, configuration retries, room moves/rollback, current assignment, mandatory accessibility, combined-role confirmation bypass, calendar expiry/buffers, virtual null capacity and real form-label compatibility. Canonical decision intents are `VenueBookingApproved` / `VenueBookingRejected`, matching the independent-booking contract.

## Continue and review

1. Review the source/API/model delta, provisionally selected policies and current PM case wording; CS-74 and CS-77 still need peer agreement. TC-CS36-03/10's under-capacity fallback examples conflict with the live hard-capacity/clear-no-results AC; keep them unaccepted until the PO resolves that wording. TC-CS37-14's omitted-deadline example differs from the server-derived persisted default; its past-deadline assertion is only partial source-case coverage.
2. Marc: deliver CS-10 Safety role/capabilities and CS-50/51 real transactional relay → RabbitMQ → permitted inbox delivery. `booking_outbox` records durable business intent, not delivered notifications. Private venue rechecks use HTTP and are not a substitute for shared RabbitMQ infrastructure.
3. Alan/Javier: CS-42 supplies explicit current technical/support readiness, including a reviewed NOT_REQUIRED proof where relevant; CS-77 supplies preparation/confirmation/Safety version/rework/privacy contracts. Then Aryan can implement CS-93/94/95 fully without guessing roles or treating empty equipment as approval.
4. CS-90 integrates the production scheduled hold expiry/reminders; exact deadline read/write guards already work independently of a late worker. CS-88/91/92 replacement/restoration/wider cancellation remain separate scope.
5. Team vetting, remaining original PM scenarios, manual/PO acceptance and reviewed PR/merge are required before Done. No Jira status or peer card was changed in this phase.

Reproduce from the checkout root with Node22 and separately migrated disposable `event_test`, `venue_test` and `booking_test` databases:

```bash
# Supply each service's matching disposable DATABASE_URL.
npm run test:coverage --prefix services/event-service
npm run test:coverage --prefix services/venue-service
npm run test:contract --prefix services/venue-service
npm run test:integration --prefix services/venue-service
npm run test:coverage --prefix services/booking-service
npm run test:contract --prefix services/booking-service
npm run test:integration --prefix services/booking-service
npm run test:hold-spike --prefix services/booking-service
# Frontend regression needs the migrated Event database and mock auth.
NUXT_AUTH_MODE=mock npm run typecheck --prefix frontend
npm run typecheck:e2e --prefix frontend
NUXT_AUTH_MODE=mock npm run test:coverage --prefix frontend
# Full live runner requires fresh project/work directory; never reseed old volumes.
CSE2E_PROJECT=csreview-aryan-ci-unique-phase \
CSE2E_WORK_DIR=/tmp/connectsphere-unique-new-review \
bash scripts/run-event-review-ci.sh
```

See [model](../venue-data-model.md), [BFF](../frontend-bff-venue-booking.md), [policy register](../venue-policy-decisions.md), [hold proof](../hold-expiry.md), service Swagger and the [canonical DEVLOG](DEVLOG.md). Hosted evidence remains on the existing branch workflow, including its required aggregate check name.
