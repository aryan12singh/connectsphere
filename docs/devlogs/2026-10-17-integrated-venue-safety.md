# Integrated Venue, Safety and notification delivery — 17 October 2026

Later clarification: Q2 was resolved on 17 October after this checkpoint. See
[the venue-confirmation follow-up](2026-10-17-venue-confirmation.md). The results
and pending decisions below describe the earlier execution time.

Branch `feat/aryan-sprint3-venue-safety`; [PR #11](https://github.com/aryan12singh/connectsphere/pull/11). This entry supersedes older statements that the integration consists only of UI scaffolds or outbox intents. It does not imply merge, human acceptance or closure.

## Delivered

* Synced current Event main foundation and selectively integrated the notification/technical-request foundations with original authors credited.
* Durable RabbitMQ topic/queue/bindings/DLQ; confirmed mandatory publisher relays in Booking and Event; stable message IDs, retry/backoff, suppression and restart recovery; current-recipient notification consumer with durable duplicate receipts and private-note filtering.
* Real deadline warning/expiry notices; hold expiry never releases equipment or confirms the Event.
* Actual Technical Support inventory/reservations, full-request atomic stock checks and current-source coverage. Unknown needs require per-need versioned classification; generic promises cannot approve missing equipment. Technical forms, review, inventory and reserve/release controls are reachable.
* Actual Safety Officer role/queue and APIs, seven-factor immutable snapshots/decisions/history, current Coordinator submission/review/rework, owner-safe feedback, source correction, approved-proof confirmation and separate Preparation. Venue notes identify the current approved room/round.
* Resource-owned readiness fences and durable owner-side Venue maintenance operations; interrupted updates remain blocked and exactly resumable/cancellable. Current factual changes invalidate old evidence before mutation; handover metadata preserves factual sign-offs.
* Scoped venue rejection cannot be bypassed by unchanged room recreation, version/name changes, altered tag order or a second same-venue session. Old Officer feedback remains historical; only current proof permits another round.
* Actual browser verification also repaired Safety Officer sign-in at the BFF, stable decision/control labels and pre-hydration Preparation selectors. The final required-room note is checked against its persisted booking/round IDs.
* Source ownership, secondary roles, stale same-key races, Equipment proof/release and operational-window move invalidation defects found during independent review were reproduced and fixed. Decision reasons use the PM boundary's internal default of 1–500 trimmed characters.

[Integration and Marcus handoff](../sprint3-integration-handoff.md), [Event/Safety OpenAPI](../../services/event-service/docs/openapi.yaml), [Equipment OpenAPI](../../services/equipment-service/docs/openapi.yaml). The handoff records inventory/bundle engineering defaults, IDs, start/test commands, delivery boundaries and Q2.

## Verification and evidence

Node 22.23.3 and locked dependencies. Expanded frontend 386/386; application and E2E typechecks pass. The earlier production build and baseline CI passed; the final pushed revision's CI is linked on the PR. Service unit/HTTP/PostgreSQL results: Event124/2/23; Venue43/11/13; Booking35/14/17; Equipment8/8/5; Notification21/12/4; Auth23/4 and User6/5 (unit/PostgreSQL). Actual PostgreSQL hold-spike10/10. The expanded frontend coverage report is 68.97% statements/65.07% branches; it is not a claim of whole-system E2E coverage or a newly agreed team threshold.

Actual authenticated Safety acceptance covers current complete venue/technical proof, not-required and required equipment branches, numbered rounds, reject/rework, source corrections, invalidation, scoped notes, confirmation and Preparation. Actual broker fault acceptance covers outage, producer restart, retry, duplicate replay, mandatory unroutable return and malformed-envelope DLQ. A PostgreSQL before-commit barrier proves pending Venue maintenance blocks readiness after downstream timeout and exact-operation recovery commits a receipt with the write.

Canonical source cases and dated RED/GREEN/browser execution records remain under `tests/records`. Raw JSON, coverage, screenshots, database extracts and redundant exploratory records stay in the external Sprint3 evidence folder/hosted artifacts. Source-level audit controls use isolated adapters and are explicitly separate from live acceptance. The interrupted browser run caused by replacing its bind-mounted production build is retained as an infrastructure diagnostic; final browser verification uses a fixed build. The first full browser run passed 77/78 and exposed a real mobile inventory hydration race: typing before the input listener mounted could save unchanged stock. Inventory and unknown-need controls now wait for hydration and stay disabled during saves; the server-rendered regression failed before the fix and passes afterwards. The rebuilt production desktop/mobile Equipment and multi-room Safety rerun passes 6/6. The failed diagnostic is retained separately, with no failed screenshot presented as passing evidence. The shared Sheet maps scenarios to actual canonical cases/layers rather than assuming matching numeric suffixes mean the same test.

Final browser/CI results and shared evidence links are recorded on PR #11 and the current Jira delivery checkpoint at the pushed revision. All CI jobs, including real service migrations, unit/HTTP/PG checks and the full production browser/restart suite, remain required by the existing combined merge gate.

The final evidence audit added same-fixture search/calendar/write checks, current approval and Safety recipient receipts, before-change migration preservation, live countdown, setup-versus-block and required-room negative checks. It also exposed a genuine rework race: a delayed venue recheck changed exact booking versions after the Coordinator reviewed unchanged Safety facts. TC-CS93-48 reproduces the metadata mismatch before the fix and passes afterwards. Review identity now uses normalized factual room/attendance proof; the exact resource fence, invalidation, token/generation and current-authority checks remain intact. An explicit-null transaction marker also prevents recursive locking in the isolated memory HTTP adapter. Deadline evidence distinguishes a persisted tentative row from effective expiry and a durable expiry-notice intent; no fictitious stored `EXPIRED` transition is claimed.

## Still open

**Q2 only as a customer policy decision:** whether a Coordinator booking request already constitutes their confirmation or a separate confirmation action is needed before Venue Staff approval. Keep it pending in CS-76 and CS-37/38 until an actual PO answer. Q1's first-confirmation buffer lock and recorded two-step legacy communication are implemented.

Peer code review, approved main merge/post-merge checks and actual manual/PO acceptance remain human release gates. CS-74 model review, CS-78 timebox/review and CS-96 actual team routine adoption cannot be asserted by automation. No teammate was contacted and no peer ticket was closed by this work.
