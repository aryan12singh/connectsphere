# Sprint 3 Venue, Safety and notification integration

17 October 2026. Branch: `feat/aryan-sprint3-venue-safety`; review: [PR #11](https://github.com/aryan12singh/connectsphere/pull/11). This supplements the earlier phase records. Actual verification is indexed in [the current DEVLOG](devlogs/2026-10-17-integrated-venue-safety.md).

## Marcus: RabbitMQ and notification handoff

The broker, bindings, producer relays and notification consumer run in `infra/docker-compose.yml`. Start the normal development stack with `docker compose -f infra/docker-compose.yml up -d --build`, then run the seed service on a new disposable development database. Keep existing volumes when restarting. Supply your own broker/internal credentials outside local development. Service-to-service AMQP uses `rabbitmq:5672`; the normal local host port is 5672, management 15672. Isolated review ports are generated separately.

| Item | Contract |
|---|---|
| Exchange | `connectsphere.events`, durable **topic** |
| Inbox queue | `notification-service.domain-events`, durable, manual ACK after durable receipt/inbox storage, prefetch 5 |
| Bindings | `booking.#`, `event.#`, reserved `safety.#` |
| Dead-letter exchange / queue | `connectsphere.events.dead-letter` (durable fanout) / `notification-service.domain-events.dead-letter` |
| Producers | Booking `booking.<type>`; Event `event.<type>` (including Safety types) |
| Environment | `RABBITMQ_URL`; optional `RABBITMQ_EXCHANGE`, `RABBITMQ_QUEUE`; matching defaults must be shared |
| Persistence | Service-owned PostgreSQL outbox and notification DB, persistent messages, durable RabbitMQ volume |

Envelope: `{id, type, aggregateType, aggregateId, payload}`. The **outbox row ID** is stable across retries; it is also AMQP `messageId` and inbox `sourceMessageId`. Payloads carry source IDs, Event/request name, action-time context and type-specific fields. Never generate a new ID on retry. Producers set mandatory routing and wait for a publisher confirm before marking an outbox row delivered. Confirms and consumer ACKs establish different boundaries ([RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms), [queue durability](https://www.rabbitmq.com/docs/queues)). A crash after confirm but before the outbox update can redeliver; the message-level database lock/receipt and per-recipient unique constraint prevent a second inbox item. An unroutable publish remains retryable. Publish retry backs off from 2 to 60 seconds. Terminally irrelevant intents are recorded as suppressed; they are not false delivery receipts.

| Booking types | Relevant payload |
|---|---|
| `BookingRequested` | `bookingId`, `venueId`, `eventId`, request/owner/Coordinator IDs |
| `BookingDecided` | Above, `decision: APPROVED/REJECTED`, decision `version`, reason, remaining required venues |
| `HoldExpiring`, `HoldExpired`, `HoldExtended` | Booking IDs, exact `expiresAt`; warning/expiry keyed by booking + deadline |
| `HoldExtensionRequested` | Active booking and pending extension |
| `BufferConflictFlagged`, `VenueUnavailable` | Affected booking and current flags; internal reason remains staff/Coordinator-only |
| Event types | Existing submitted/assigned/reassigned/approved/rejected/returned/resubmitted types; `SafetySubmitted`, `SafetyApproved`, `SafetyChangesRequested`, `SafetyEvidenceInvalidated`, `EventConfirmed` |
| Safety context | `eventId`, `eventRequestId`, `roundId` where relevant, actionable `comment`/areas; no private Officer notes |

The consumer resolves **current** ownership, lifecycle and decision/round/deadline before delivery. Old assignment or replaced decision/round messages are suppressed. It preserves action-time targets where required. It records processed/ignored/failed receipts, and uses the imported initial attempt plus three retries policy for application delivery failures; final failures appear in Technical Support's failure view. Database unavailability retains/redelivers the broker message instead of ACKing lost storage. Invalid envelope/array payloads go to the DLQ. This is a single-node development broker, not a replicated HA deployment. No real teammate messages or email are sent.

For a complete disposable verification, use Node 22:

```sh
CSE2E_PROJECT=csreview-aryan-ci-local-unique \
CSE2E_WORK_DIR=/absolute/new/review-directory \
CSE2E_PORT_BASE=33000 bash scripts/run-event-review-ci.sh
```

The runner builds/seeds its own isolated stack, exercises actual authenticated business writes and PG/Rabbit delivery, broker outage/restart/replay, malformed DLQ and mandatory returns, Safety, browser and restart checks. It retains evidence and database volumes on failure; it never resets another development stack. Do not attach a second competing consumer while testing inbox delivery unless intentionally testing queue sharing. Use another queue bound to the exchange for independent inspection; do not consume and ACK Marcus's work queue as a debugger.

## Updating an existing local development stack

Keep existing PostgreSQL and RabbitMQ volumes. The database initializer only runs for a new volume; check that `equipment_db` and `notification_db` exist before starting their newly active services. Create only a missing database with the configured PostgreSQL owner, then start/build the services so their own migrations run. `docker compose -f infra/docker-compose.yml run --rm seed` reruns the idempotent seed SQL after migrations; it adds the Officer and capability rows without resetting customer records.

Keycloak does not re-import an existing realm automatically. Through its local admin console, add the missing `SAFETY_OFFICER` realm role and the synthetic Officer fixture from `infra/keycloak/connectsphere-realm.json` using **partial import / Skip existing**; preserve its fixture ID, verified email and role. Do not replace the whole realm or delete its volume. Real environments should provision their own Officer through their identity administrator. Sign out and back in after changing roles/capabilities. The isolated review runner uses a new realm and database volume and requires none of these existing-volume adjustments.

## Event and Safety ownership

Javier's Event foundation is merged from current main. Marcus's notification and Alan's technical-request foundations are selectively integrated with original authors credited. These are bounded integration changes; their complete Jira stories and acceptance are still owned by them.

* Event owns Safety operations, immutable numbered snapshots/decisions, source corrections, Coordinator review, history, confirmation and Preparation. The Event transaction does not wait for resource-service RPC. Booking and Equipment own durable readiness fences and actual resource writes.
* Only the current assigned Coordinator with capability may submit/rework/advance. An active Safety Officer with capability reviews seven factors. Organisers see actionable feedback, never internal checklist/private notes. Public signup cannot grant Officer/staff roles.
* A venue hold is not approval. Every required venue must be confirmed, current, conflict-free and suitable. Technical Support must explicitly approve current requirements and actual reservations, or explicitly approve that equipment/support is not required. Source changes fail closed. Handover alone does not invalidate factual sign-offs.
* Safety approval does not itself confirm the Event. The Coordinator confirms it, then separately starts Preparation. Staff preparation notes identify the required booking and current approved Safety round/token; previous rounds remain historical.
* Rework records a current Coordinator next action; unaffected approvals remain. Venue rejection is scoped to selected arrangements. A rejected arrangement must be materially corrected/replaced before another round; names, version increments, recreated identical rooms and tag ordering cannot bypass that check. No automatic blanket reset/cancellation.
* Coordinator review identity follows current Safety facts and attendance allocation. Venue display names and asynchronous recheck versions do not require an otherwise unchanged review again. Booking retains a separate exact-version fingerprint for resource fences, so factual equality never reactivates an invalidated token or bypasses current-source/version checks.
* Venue maintenance commits a durable owner-side pending fence before the downstream Booking check. Pending/uncertain writes block readiness even after timeout. Exact-operation resume/cancel and atomic apply receipts prevent stale operations from overwriting later work.

See [Event OpenAPI](../services/event-service/docs/openapi.yaml) and [Equipment OpenAPI](../services/equipment-service/docs/openapi.yaml). All `/internal/*` endpoints require the shared private credential and are absent from Kong routes. Actual Event IDs and Event-request IDs are distinct.

## Equipment assumptions used for integration

The inventory is pooled by equipment type over the advertised Event `[startAt,endAt)` interval. Adjacent periods may share inventory; peak concurrent load controls availability. Portable setup/transport buffers and room-specific equipment allocation are not inferred. Catalogue `projector` includes its screen; `stage` includes its podium. PA maps to speaker + microphone. Unknown/streaming needs require a versioned per-need Technical Support classification: equipment types backed by actual reservations, or explicit support-only with a substantive reason and support plan. Approval alone never invents stock.

Venue booking approval/rejection reasons use a trimmed 1–500-character limit, reconciling the PM sheet's placeholder boundary as an engineering default.

Stock starts at zero until Technical Support records actual inventory. Reservation is complete/all-or-none under sorted stock locks; capacity cannot drop below committed peak load. Revised requirements need fresh approval/reservation. An empty current approved request explicitly releases superseded stock. Terminal Event release is explicit. Venue hold expiry never releases equipment or confirms an Event. These are documented engineering defaults for team review, not invented customer answers.

## Remaining decision and human gates

**Q2 remains pending:** does the Coordinator's venue booking request already constitute Coordinator confirmation, or is a separate Coordinator confirmation required before Venue Staff approval? Continue the current request → Staff decision flow until the PO answers; do not label this customer-approved. When the answer arrives, reconcile CS-76, CS-37/38, the sheet and API/UI tests together.

Q1 is resolved: buffers remain adjustable until first Staff-confirmed booking, then lock. One-use initial configuration for pre-policy bookings requires Staff's recorded communication with each current Coordinator and attestation that the Coordinator communicated with the Organiser. This records a Staff attestation; it is not independent proof that the external conversation occurred.

Review approval, merge, post-merge main CI and actual PO/manual acceptance remain separate release gates. Model/spike review and real team adoption of evidence/async routines cannot be inferred from automation. The shared evidence folder contains real synthetic-stack observations, not a claim of human acceptance.
