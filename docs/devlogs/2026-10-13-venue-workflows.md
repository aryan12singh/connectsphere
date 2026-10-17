# Sprint 3 venue continuation — 13 October 2026

## Delivered behavior

Aryan continues `feat/aryan-sprint3-venue-safety` from published `153c15d`.
Main `52687d2` remains integrated. This phase advances the eight venue stories;
the Safety stories remain blocked by their actual cross-service prerequisites.
No PR or story closure is part of this publication.

- CS-36/37/87: booking-specific alternative search prefills individual room needs
  and excludes its original venue. Versioned unapproved moves retain the booking
  ID, sibling arrangements and history. Approved alternatives are assessment
  only. Successful acknowledged requests retire their action key; ambiguous
  failures retain it. Stale moves refresh the selected version without erasing
  edited criteria, and stale async responses cannot restore actionable results.
- CS-38: Staff decisions and extensions become unavailable at the persisted
  deadline while the queue is open. Missing or null legacy Event links remain
  visible and non-actionable without poisoning healthy requests. Current status,
  venue and Event filters are reapplied after a summary waits behind a write.
- CS-84/85/86: Staff can compare both current occupied windows and explicitly
  recheck inherited commitments during buffer rollout with the read Venue version
  and a reason. Approved bookings stay retained. The report and recheck keep
  conflicts through turnaround, including after advertised end. Repeats do not
  duplicate history or transactional notice intent.
- Historical removed venues and expiry during a removal/read race no longer
  break healthy availability or conflict reads. Current/future missing-venue
  commitments still fail closed. Deletion holds the booking commitment lock and
  uses a checked configuration version under Venue's row lock; a concurrent
  buffer edit returns409 and preserves the Venue/booking.
- Staff calendar permissions recognize an authorized secondary role. Operational
  edits offer only valid operational transitions; approved arrangements remain
  read-only. Booking DELETE forwards through the BFF to the service's protected
  denial405 and retains the booking/history.
- Venue history uses immutable origin/movement snapshots: creation stays at its
  original venue, movement appears in both timelines, and current assignment
  governs privacy. Snapshotless imports anchor to the earliest known snapshot;
  only records with no snapshot retain the existing current-venue fallback.

The [BFF contract](../frontend-bff-venue-booking.md),
[model](../venue-data-model.md), [clock research](../hold-expiry.md), Swagger,
blue case specifications and dated yellow records are current. This phase adds
no schema migration or machine-generated JSON to Git.

## Verification and audit

Node22.23.3 and isolated PostgreSQL16 were used. Source/test/infra/API-doc
SHA256, excluding Markdown and generated evidence: `ae93fcb79a7709ba7ab7f7f7417636a9245cc68ed454f2828f37a22ebe12a751`. Runtime source changes had
observed behavioral RED assertions before their fixes. One independent audit
and focused re-review found no remaining confirmed defects in the reviewed paths.
That bounded review does not establish absolute correctness or human acceptance.

| Layer | Final result | Scope |
| --- | --- | --- |
| Full frontend regression | 292/292; zero skipped | Includes143 checks for the eight venue stories; real service handlers and Nuxt component/transport fixtures |
| Venue unit / HTTP / PostgreSQL | 43/43 · 11/11 · 6/6 | Versioned deletion proof, immutable state on stale/missing proof, buffers and durable rechecks |
| Booking unit / HTTP / PostgreSQL | 35/35 · 14/14 · 15/15 | Actual advisory-lock decision/move waiters, no overlapping writes, rollback, repeat recheck and private origin history |
| Event regression / hold research | 22/22 · 10/10 | Existing Event route suite; disposable hold lease/restart/clock proof, not a production expiry worker |
| Static and build | Both typechecks and production build pass | API JSON parses with valid local references; changed source passes whitespace checks |
| Production stack | 11/11 smoke · 52/52 desktop/mobile · 1/1 restart; zero reruns/flaky/skipped | Real Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; desktop/mobile, smoke and restart, with browser reruns disabled |

Measured frontend source coverage:74.86% statements,73.09% branches,72.11%
functions and76.77% lines. No agreed threshold is claimed.

Full outputs, coverage and raw reports stay outside Git under
`/tmp/connectsphere-s3-20261013-phase3/`. Final production evidence is under
`/tmp/connectsphere-s3-live-phase3-delivery-20261013/evidence/`; screenshots are
named for CS-86 conflict/recheck and CS-87 individual room changes/extension.
The exact published revision must also pass all eight hosted workflow jobs;
its immutable commit and CI links are recorded in Aryan's Jira progress comments.

Earlier attempts are retained. Initial browser fixture assertions confused the
existing BFF success200 with direct service creation201; those fixtures were
corrected without changing production semantics. The subsequent live run caught
the missing protected-method BFF route and retained its405 expectation. A Nuxt
build and test competing for generated files caused one invalid import attempt;
checks were rerun sequentially. A component transport stub and one timed-out
setup were diagnostic failures, not behavioral RED proof. PostgreSQL rollback
tests deliberately reject outbox inserts. No accepted AC was weakened or skipped.

## Remaining boundaries and next work

- Marc CS-10 supplies Safety role/capabilities. Alan CS-42 supplies current
  technical/support readiness and reviewed explicit NOT_REQUIRED proof. Javier
  CS-77 supplies the reviewed preparation/confirmation, version/rework and privacy
  contract. Then Aryan can implement CS-93/94/95 without guessing or treating an
  empty equipment list as approval. Safety has no executable acceptance evidence.
- Marc CS-50/51 must relay transactional intent through RabbitMQ and deliver
  permitted inbox notices. Current outbox persistence is not notice delivery.
- CS-76/77 still need customer/team policy decisions. The hard-capacity versus
  under-capacity examples in TC-CS36-03/10 and omitted versus derived deadline in
  TC-CS37-14 need PO wording agreement. Defaults, extension caps, touching and
  processing targets remain working settings. Figma/manual design acceptance and
  the original PM cases still require their stated layers.
- CS-79 must agree/enforce the Sprint 3 coverage threshold. Measured coverage is
  reported, not an invented policy or a claim that all source requirements passed.
- CS-88/90/91/92 retain Sprint 4 confirmed-room change/cancellation, scheduled
  expiry/reminders, public unavailability/replacement/restoration scope.
- CS-74 needs another developer's model review; CS-96 needs actual team adoption
  of the evidence/async routine. Review, merge, green merge CI, manual verification
  and PO acceptance remain before story Done.

Reproduce using Node22, separately migrated disposable `event_test`,
`venue_test` and `booking_test`, and each service's matching DATABASE_URL:

```bash
npm run test:coverage --prefix frontend
npm run typecheck --prefix frontend
npm run typecheck:e2e --prefix frontend
npm run test:coverage --prefix services/venue-service
npm run test:contract --prefix services/venue-service
npm run test:integration --prefix services/venue-service
npm run test:coverage --prefix services/booking-service
npm run test:contract --prefix services/booking-service
npm run test:integration --prefix services/booking-service
npm run test:hold-spike --prefix services/booking-service
# Use a new csreview-aryan-ci-* project and a new outside-Git work directory.
bash scripts/run-event-review-ci.sh
```
