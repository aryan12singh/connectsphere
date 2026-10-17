# Sprint 3 buffer rollout and independent Safety UI — 13 October 2026

Aryan continues `feat/aryan-sprint3-venue-safety` from `c49541b`, with main
`52687d2` integrated. This phase completes available CS-86 automation, adds
venue browser/database evidence, and advances the independent CS-93/94/95 UI
and validation. Review, merge and story acceptance remain separate gates.

## Delivered behavior

- CS-86: an additive migration and automatic Venue worker persist one initial
  buffer-evaluation receipt per inherited/imported venue. Discovery locks a
  bounded batch with `SKIP LOCKED`; retries retain their action ID across outages
  and restart. Captured or newer Booking acknowledgement completes the receipt.
  Configuration and rollout work share an attempts-first bounded queue, so a
  failed early venue cannot starve healthy later venues. API-created venues
  atomically record that their new ID has no inherited commitments; subsequent
  edits still create exactly one configuration action. Existing approvals and
  advertised Event times remain intact; conflicting commitments are flagged.
- CS-93: the current assigned Coordinator's Event venue screen displays actual
  preparation blockers, current per-room attendance/capacity/layout/accessibility
  and the seven Safety factors. Unknown operational and technical facts remain
  explicit. Submission stays disabled until the real Safety prerequisites exist.
  Current Venue type overrides an old Virtual requirements snapshot for capacity
  warnings. Missing or stale/private Event data does not become actionable.
- CS-94: reusable seven-factor review and decision components validate Approve,
  Reject and Request Changes, trimmed reasons, affected areas, current round and
  requirements revision. Default permissions are disabled; malformed/stale proof,
  duplicate intents and unhydrated interaction are refused. Changing rounds
  clears superseded drafts. Repeated identical failures allow retries.
- CS-95: a reusable rework component displays only permitted feedback, affected
  areas and retained unaffected approvals. Every affected area needs explicit
  current readiness proof before emitting one versioned resubmit intent. Stale
  proof is labelled unverified; earlier feedback is retained and failures retry.
  Officer/rework components are standalone handoff artifacts, with no production
  Officer route, persisted decision or claimed Event transition.
- CS-74/78/96: the model record includes initial rollout persistence and a
  baseline consultation comparison. The clock research identifies shared
  scheduling mechanisms versus distinct hold, Event completion and waiting-list
  policies. Current blue/yellow records, this DEVLOG and a named screenshot pack
  make the phase reproducible. PM supplemental Safety cases are preserved with
  source identifiers and remain Not Executed.

See the [model](../venue-data-model.md), [Safety integration handoff](../safety-ui.md),
[BFF summary](../frontend-bff-venue-booking.md) and [clock research](../hold-expiry.md).
No new role, Event lifecycle, equipment schema or public Safety endpoint is added.

## Verification and audit

Node22.23.3 and disposable PostgreSQL16 were used. Application changes had
observed behavioral RED assertions before their fixes. The independent audit
identified current-capacity presentation, stale rework wording, same-error retry
and two incorrect browser fixtures. The regressions were reproduced, fixed and
re-reviewed with no remaining confirmed actionable finding in the audited paths.
The review was bounded; it does not guarantee absolute correctness or acceptance.

| Layer | Result | Scope |
| --- | --- | --- |
| Frontend regression | 317/317; zero skipped | 146 venue assertions plus22 independent Safety assertions; real boundary and component layers are labelled |
| Venue unit / HTTP / PostgreSQL | 43/43 · 11/11 · 9/9 | Concurrent initial discovery, reconnect/restart, newer configuration acknowledgement, bounded-batch fairness and existing contracts |
| Booking unit / HTTP / PostgreSQL | 35/35 · 14/14 · 15/15 | Current authorized summary, locks, atomic conflict protection, history, expiry and independent arrangements |
| Event regression / hold research | 22/22 · 10/10 | Existing Event route suite and disposable scheduling proof; no production expiry worker claimed |
| Static and build | Both typechecks and production build pass | API JSON/local references and whitespace verified |
| Full production stack | 68/68 desktop/mobile · 11/11 smoke · 1/1 restart | Real Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; zero retries, flaky or skipped cases |
| Final evidence recapture | 14/14 desktop/mobile; zero retries/skips | Actual SQL timestamps match API advertised/occupied times; committed approval reason/history and rollout receipts captured after a real login preflight |

Measured frontend source coverage:76.06% statements,74.18% branches,73.43%
functions and77.96% lines. No agreed coverage threshold is claimed. Database
evidence recapture results are recorded in the final publication index and
canonical browser execution records. The published commit
must also pass all eight hosted workflow jobs; exact commit/CI links belong in
the Jira checkpoint comments.

The named evidence pack is retained outside Git at
`/Users/DarthAryan/Downloads/SMU/Y3S1/IS212 SPM/PROJECT/sprint3-evidence/2026-10-13-venue-safety/`.
Its index maps the screenshots and captured query results to actual browser
cases and source fingerprints; the ZIP is linked from CS-96, with selected
images attached to the relevant own stories. Raw JSON, HTML and coverage are
not added to the branch. Final, RED and failed execution records stay canonical;
26 redundant intermediate green records remain in the pack's execution history.

Source/test/infra/API SHA256, excluding Markdown and generated records:
`61ca082c071513ff1129556510e176a7b00c4cbf53ea16453a07546629c89724`
for the audited application/full browser run. Final publication after only the
UTC evidence-parser/assertion/capture improvements:
`a8f29b7b4fc8720a91c8114d6519c1ae3f43783adc4859f4f6cd749dcf51a9e8`.
The final hosted workflow checks the exact published commit.

Raw outputs, diagnostics and coverage remain outside Git under
`/tmp/connectsphere-s3-20261013-phase4/`. Earlier failed attempts are retained.
The first browser attempt exposed incorrect facility-filter, BFF error-envelope
and operational-closure fixture assumptions; accepted product requirements were
preserved. A visual database check also caught host-local parsing of UTC SQL
timestamps. Corrected evidence must use UTC and match the actual saved/API times.
The first recapture started before Keycloak was ready:10 login setups returned503,
and4 later cases passed. That infrastructure diagnostic is retained. The final
14-case recapture waited for service readiness and passed a real login/persistence
preflight; UTC query/API comparisons and all browser cases then passed.
The screenshots are actual UI captures or explicitly labelled reports of actual
PostgreSQL queries on synthetic review fixtures, not customer acceptance.

## Remaining dependencies and closure gates

- Marc CS-10, Alan CS-42 and Javier CS-77: actual Officer authorization, complete
  current technical/support reservation proof, reviewed queue/round/readiness and
  Event preparation/rework/privacy contract. Then integrate the disabled Safety
  action, real queue, durable decisions/history, selective reopening and resubmit.
- Marc CS-50/51: real outbox relay, consumer/inbox delivery and deduplication.
  Durable notice intent and an acknowledged Booking command do not prove delivery.
- CS-76/77: customer answers remain Pending, including lifecycle ordering,
  buffer/touching policy, hold limits/omitted-deadline wording and multi-room
  registration capacity. CS-79 owns the agreed coverage policy and integration gate.
- CS-74 needs another developer's model review; CS-78 retains unresolved policy,
  reviewed spike/timebox gates; CS-96 needs actual team/Figma/cadence adoption.
- Independent human manual review, approved main merge, green main CI and PO
  acceptance are required before closing stories. None is inferred from automation.

CS-88/90/91/92 production expiry/reminders, confirmed-room changes and
unavailability/replacement/restoration remain outside this Sprint 3 slice.

## Reproduction

Use Node22 and disposable service databases. Run the frontend typechecks and
`npm run test:coverage --prefix frontend`; Venue/Booking unit, contract and
integration scripts; Event unit checks and Booking's `test:hold-spike`. The real
stack runner is `scripts/run-event-review-ci.sh`, requiring a new external
`CSE2E_WORK_DIR` and unique `csreview-aryan-ci-*` project. It builds Nuxt, seeds
only a fresh isolated volume, runs live smoke/browser checks, restarts services
and verifies persistence. Retained review volumes are never reseeded.
