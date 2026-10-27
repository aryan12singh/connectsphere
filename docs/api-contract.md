# Sprint 2 API contract — shared conventions

## Event workflow implementation amendment — 2026-10-06

The event-service and event BFF **implemented contract** is [event-workflows.md](event-workflows.md) and [its OpenAPI](../services/event-service/docs/openapi.yaml). This amendment supersedes conflicting event-request draft rules below: owner-private Requests/Drafts; assigned-only Coordinator reads; same-organisation visibility only for actual Event history; required scoped idempotency keys on all request writes, changed payload409 with retained replay rows; error.fields mapping; cursor history pages20; supported local date/clock+zone adapter alongside offset instants. Broader services retain their own contracts. These deliberate deviations do not silently redefine other teams' endpoints or notification delivery.

The following historical shared draft is retained for team traceability; planned event/reassignment/confirmation endpoints within it are not evidence they exist.

---

Status: **agreed draft for review** (Sprint 2 story "Agree the interfaces"). Frontend and
backend build against this in parallel. Per-service detail is in each service's OpenAPI file:

| Service | OpenAPI file | Public via Kong |
|---|---|---|
| auth-service | `services/auth-service/docs/openapi.yaml` (+ Sprint 2 section below) | `/auth/*`, `/admin/*` |
| user-service | `services/user-service/docs/openapi.yaml` (public routes at the end) | `GET /users/*` only |
| event-service | `services/event-service/docs/openapi.yaml` | `/event-requests/*`, `/events/*` |
| venue-service | `services/venue-service/swagger.html` (owned by the venue epic) | `/venues/*` |
| equipment-service | `services/equipment-service/docs/openapi.yaml` | `/equipment-types`, `/equipment-inventory/*`, `/technical-requests/*`, `/event-requests/*/technical-request/*` |

Later services (booking, equipment, notification, attendance) document their own API in the
story that scaffolds them. CS-57 checks the final documentation.

---

## 1. Identity: who is calling

**Browser → Nuxt BFF → Kong → service.** The browser holds a cookie; the BFF turns it into
`Authorization: Bearer <token>`. Services never see the cookie.

Every service needs to know *who* is calling and *what they may do*. The contract is these
headers, set by the platform and **never trusted from a client**:

| Header | Example | Meaning |
|---|---|---|
| `x-user-id` | `a1000000-0000-4000-8000-000000000005` | The caller's user id |
| `x-user-roles` | `EVENT_ORGANISER,ATTENDEE` | Comma-separated roles (multi-role; at least one) |
| `x-organisation-id` | `b1000000-…-000000000001` | The caller's organisation; absent if none |

* Kong **strips** these three headers from every incoming request (see `kong.yml`), so a client
  cannot forge them.
* **Today** Kong cannot validate a session by itself, so each service's `requireIdentity`
  middleware gets the same three values by calling auth-service
  `POST /internal/sessions/validate` with the bearer token, and exposes them as `req.identity`.
  Handlers only ever read `req.identity`. When the gateway starts adding the headers, only that
  middleware changes.
* `/internal/*` routes are never routed by Kong and need `x-internal-api-key`.

**Roles are not permissions to act on a specific record.** `EVENT_COORDINATOR` lets you *be* a
coordinator; it does not let you approve an event assigned to someone else. Services check the
role **and** the relationship (owner, current Coordinator, same organisation). A user with several
roles gets each role's rights, never an override of the relationship rules.

## 2. Identifiers

* All ids are UUID strings (`a1000000-0000-4000-8000-000000000005`). Never sequential integers.
* Cross-service references are plain id strings; the owning service is the only place to resolve them.

## 3. Dates and times

* **Wire format: ISO 8601 with a time zone**, e.g. `2026-11-20T09:00:00+08:00` or `2026-11-20T01:00:00Z`.
  A value **without** an offset (`2026-11-20T09:00:00`) is rejected with 422.
* The server stores an instant (`timestamptz`) and returns it in UTC (`…Z`).
* Where a human intent matters, a separate `timeZone` field carries the IANA name
  (`Asia/Singapore`) so the UI can render "09:00 Singapore time".
* Venue opening hours are the one exception: wall-clock `"HH:MM"` in the venue's `timeZone`.
* Date-only fields are not used.

## 4. Errors

Every error body, from every Sprint 2 service:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "A request in status APPROVED cannot be approved.",
    "details": [ { "field": "reason", "message": "Reason is required." } ]
  }
}
```

`code` is a stable machine-readable string, `message` is safe to show, `details` is optional
(field-level problems). No stack traces or SQL, ever.

| Status | Meaning in ConnectSphere | Typical `code` |
|---|---|---|
| 400 | Malformed request (bad JSON, bad query syntax) | `BAD_REQUEST` |
| **401** | No session, expired, revoked, or account disabled. Same message for all. | `UNAUTHENTICATED` |
| **403** | Signed in, but not allowed: wrong role **or** not the owner / assigned Coordinator. Nothing was changed. | `FORBIDDEN` |
| **404** | The id does not exist. (An id that exists but you may not see is **403**, matching the access matrix and CS-30 test 01.) | `NOT_FOUND` |
| **409** | The request is valid but conflicts with current state: invalid status transition, stale `version`, duplicate, overlapping block, already decided. Nothing was changed. | `INVALID_TRANSITION`, `STALE_VERSION`, `ALREADY_EXISTS`, `OVERLAP` |
| 422 | Well-formed but fails validation (missing/too long field, time without offset, reason of whitespace) | `VALIDATION_FAILED` |
| 429 | Rate limited by Kong | |
| 5xx | Our fault; generic message | `INTERNAL` |

Rule of thumb for 403 vs 409 (CS-32): check **who** first, then **state**. A wrong actor gets 403
even if the state is also wrong; a right actor in the wrong state gets 409.

> auth-service and user-service still return the older `{ "error": "text" }`. They move to the
> shape above when their public routes are touched; the BFF already handles both.

## 5. Idempotency

Only the `POST` calls that **create** something accept an optional header (create a request, and
submit it; venue creates follow the same rule):

```
Idempotency-Key: 6f1c0c9e-3b0a-4c2e-9a53-2f7a8d4e1b10     (a client-generated UUID)
```

* Every write (create, save, submit, resubmit, decision, reassign) **requires** the key; without it the
  service answers 400 `IDEMPOTENCY_KEY_REQUIRED`. The Nuxt BFF generates one when the browser sends none.
* Same key + same caller + same path + same body → the **original response is replayed**
  (status and body), with the header `Idempotency-Replayed: true`. Nothing runs twice.
* Same key + **different** body → 409 `IDEMPOTENCY_CONFLICT`.
* A *new* key on an already-decided request is not a replay: the status guard and the `version`
  check still apply, so a second approval with a fresh key is a 409 (story CS-12).
* Stored in `event_db.idempotency_records` for event-service. Other services may adopt the same pattern later.

## 6. Concurrency (stale and simultaneous actions)

Resources that can be changed by two people carry an integer `version`. A mutating call sends the
`version` it last saw in the JSON body. If it no longer matches → **409 `STALE_VERSION`** and
nothing changes. Two simultaneous approvals or reassignments therefore produce one success and one 409.

## 7. Lists and pagination

`GET` lists accept `?page=1&pageSize=20` (max 100) and return
`{ "items": [...], "page": 1, "pageSize": 20, "total": 83 }`.

## 8. Statuses and labels

The wire carries enum codes, never display text. The frontend has **one shared label map**
(CS-32) so every screen agrees:

| Code (request) | Label | Code (event) | Label |
|---|---|---|---|
| `DRAFT` | Draft | `ARRANGEMENT_PENDING` | **Planning** |
| `SUBMITTED` | Under Review | `CONFIRMED` | Confirmed |
| `RETURNED_FOR_AMENDMENT` | Returned for Amendment | `CANCELLED` | Cancelled |
| `APPROVED` | Planning (its Event is in Planning) | `COMPLETED` | Completed |
| `REJECTED` | Rejected | `REJECTED` | Rejected |

A request with no Coordinator shows the extra badge **Awaiting assignment**
(`awaitingAssignment: true` in the response).

## 9. Domain events (outbox)

State changes write a row to the service's `outbox` table in the same transaction. A relay
publishes to RabbitMQ later (notification-service consumes). Sprint 2 event types:
`RequestSubmitted`, `CoordinatorAssigned`, `CoordinatorReassigned`, `RequestApproved`,
`RequestRejected`, `RequestReturned`, `RequestResubmitted`. Payload always has `eventRequestId`,
`actorId` (null for system), `occurredAt`, plus type-specific ids. Consumers are not part of Sprint 2.

## 10. Auth-service additions (Sprint 2)

The existing auth routes keep their paths. What changes in the **session / role response** of
`POST /auth/login`, `GET /auth/me` and the internal `POST /internal/sessions/validate`:

```json
{
  "user": {
    "id": "a1000000-0000-4000-8000-000000000003",
    "email": "priya.raman@greenleaf.org.sg",
    "firstName": "Priya", "lastName": "Raman",
    "roles": ["EVENT_ORGANISER", "ATTENDEE"],
    "role": "EVENT_ORGANISER",
    "organisationId": "b1000000-0000-4000-8000-000000000002",
    "permissions": ["event_requests.create", "events.view", "attendance.register"]
  }
}
```

* `roles` (array, never empty) is the source of truth. `permissions` is the **union** of the roles' permissions.
* Auth-service returns the primary `role` for compatibility. The BFF uses it as an active navigation role and preserves an already granted selection across reload; authorization uses all verified `roles` and current capabilities, never the selected UI role.
* `organisationId` is `null` for users without one.
* Public signup accepts only `EVENT_ORGANISER` or `ATTENDEE` (default). Organisers supply company/organisation; user-service resolves the exact trimmed name transactionally. Duplicate email or invalid fields return field messages. Staff roles come only from seed data.
* `POST /api/auth/role` selects an already granted navigation role in the sealed cookie. It grants no database role, checks fresh `/auth/me` identity, and rejects unassigned roles with 403.
* Inactivity expires at the configured boundary (`>=`), successful protected requests record their exact activity time, and unknown/empty role lists deny 403.
* Services check the fixed action-role table and fresh effective permission together, then owner/organisation/current-assignment relationships. The [access matrix](access-matrix.md) and individual service OpenAPI contracts define each action.

## 11. Gateway map

| Path prefix | Goes to | Notes |
|---|---|---|
| `/auth/*`, `/admin/*` | auth-service | login rate-limited 10/min, register 5/min |
| `GET /users/*` | user-service | read-only; `/internal/*` never routed |
| `/event-requests/*`, `/events/*` | event-service | `POST /events/{id}/confirm` → Event, gated by current approved Safety proof |
| `/venues/*` | venue-service | |
| `/venue-bookings/*` | booking-service | Coordinator owner + current Event assignment; Venue Staff decisions; internal read-only availability |

Booking-service forwards the verified caller token to `GET /events/{id}/booking-access` before Coordinator creation/detail/edit/list/history. Event-service returns only the actual Event ID for its current Coordinator. Wrong/removed assignment denies 403; unavailable assignment validation returns 503 without writes. Venue Staff operational windows retain decision-only handling. CS-30 reassignment and confirmation remain separate workflows.

## 12. Equipment requests, availability and reservations (CS-40–42)

This section is the shared wire contract for the existing Equipment service. It combines the Jira acceptance criteria with the Product Owner's CS-40–42 prototype; explicitly adopted prototype values below are product requirements, not visual-only suggestions.

### Technical request state and version

`TechnicalRequest.status` is one of `PENDING_TECH_REVIEW`, `APPROVED`, `REJECTED`, or `NOT_REQUIRED`. `PENDING_TECH_REVIEW` is the wire label for the submitted state previously represented as `SUBMITTED`; readers may accept `SUBMITTED` for existing persisted rows while they are migrated. `NOT_REQUIRED` is a Coordinator's explicit, versioned declaration that neither equipment nor support is needed. It records the current Coordinator as actor and the declaration time, and does not create a reservation. A request that includes equipment or support cannot be `NOT_REQUIRED`. Support-only requests require Technical Support approval. Only the current assigned Coordinator may edit or declare no requirements; only Technical Support may approve, reject, configure stock, mark it unavailable, check availability, or reserve.

Every material edit increments `version` and returns the current request state. Mutating calls preserve `version` in JSON. Services may also accept `If-Match: "<version>"`; if both are sent they must agree. A stale version returns 409 `STALE_VERSION` with no partial state change. Existing history is retained when a new version supersedes old approval. Safety may read only through the existing permitted Event review relationship and has no Equipment write access.

### Prototype validation limits

* Equipment type must exist in the service catalog. Each requested quantity is a positive whole number no greater than that type's physical total stock. Period-specific availability is checked separately; a valid physical quantity may still have a shortfall for its requested period.
* Venue allocations are whole numbers greater than or equal to zero. For each equipment type, the venue allocation sum must equal the pooled requested quantity. A venue is counted once in the request; pooled stock is not duplicated for each venue.
* `supportDetails` is at most 1000 characters; `placementDetails` is at most 500 characters. Rejection reason is required, trimmed, and 1–500 characters.
* An operational unavailability entry names a known type, a positive whole quantity no greater than total stock, an offset-aware start/end with start before end, a required reason, actor and current inventory version.

### Equipment period and availability

The Equipment period is the pooled interval from the earliest `occupiedStartAt` to the latest `occupiedEndAt` among current Event bookings receiving equipment. Booking service computes each occupied interval using that venue's current `setupMinutes` and `turnaroundMinutes`; Equipment adds no separate fixed buffer. The projection carries each booking and venue version so availability and reservation can detect changed source context. Expired tentative holds and cancelled/rejected bookings do not supply a current allocation. A missing or stale allocation context prevents a fresh availability authority or reservation.

The Technical Support queue's existing `GET /technical-requests` response includes `equipmentPeriod`, derived by Equipment from Booking's current allocation projection (null for requests without equipment or when current allocation context cannot be resolved). The BFF combines these records with Event's `GET /event-requests/technical-metadata?ids=...` projection, authorized by `events.technical.metadata.view` for Technical Support only. That projection contains event title, event period, time zone and current Coordinator display name; it does not grant `events.view` or return submission timestamps.

`GET /event-requests/{id}/technical-request/availability` is a read-only check. For every requested type it returns `requested`, `available`, and non-negative `shortfall`, plus the pooled period and `checkedAt`. Availability subtracts overlapping active reservations and operational unavailability for the half-open occupied interval. Touching intervals follow the same explicit overlap policy as Booking. A check creates no reservation and does not authorize a later write. `fulfillable` is true only when every requested line has zero shortfall.

`POST /event-requests/{id}/technical-request/reservations` reserves the complete current approved request with its `version` and an `Idempotency-Key`. The service rechecks requirements, source versions, stock, operational windows and reservations while holding per-type database locks. Any short line returns 409 `EQUIPMENT_SHORTFALL` with all line shortfalls and makes no reservation. Successful replacement is atomic and records the Event, type, quantity, buffered period, actor, time, request version, and booking/venue source revisions. A repeated key and same request replays the response; same key with changed input returns 409 `IDEMPOTENCY_CONFLICT`.

`PUT /equipment-inventory/{type}` is a versioned Technical Support stock edit. An operational unavailability write is versioned and period-bound; it flags affected reservations and makes them fail fresh readiness checks without silently deleting their reservation records. Venue expiry, a single venue cancellation, or Safety rework does not release Equipment. Whole-Event cancellation uses the owning Event lifecycle's one-time release operation.

Operational-unavailability commands accept `Idempotency-Key`: exact retries by
the same actor return the same operation, including concurrent retries; changed
data with that key returns 409. Current-version readiness reports
`EQUIPMENT_OPERATION_CHANGED` when operational supply no longer fulfils an
existing reservation, retaining its rows and history. Explicitly approved
technical revisions require matching current-version reservation lines; atomic
replacement excludes that Event's previous units from competing demand and
preserves the old commitments if replacement fails. Serializable reservation
contention returns 409 `CONCURRENT_RESERVATION` for a fresh availability check.

The service also exposes internal-only `GET /internal/events/{id}/equipment-allocation-context` from Booking to Equipment. It is authenticated with `x-internal-api-key` and is never routed by Kong.


## 17 October 2026 integration amendment

Event owns Safety review, current-proof confirmation and separate Preparation. Kong additionally routes `/safety-checks`, `/preparation-work`, `/equipment-inventory`, `/technical-requests` and request-scoped technical decisions/reservations. No `/internal/*` route is public. [Integration handoff](sprint3-integration-handoff.md) documents the stable RabbitMQ contract, maintenance/readiness fencing, inventory defaults, source ownership and the resolved two-action venue policy. Booking summary `policy.pendingClarifications` is now empty: Coordinator request creates `TENTATIVELY_HELD`, and Staff approval changes that booking to `CONFIRMED`, without another Coordinator action. Parent Event confirmation remains separate. Existing request/owner privacy and fixed role-plus-capability checks still apply. For CS-40–42, the detailed request statuses, prototype validation limits, period-specific availability, and venue-buffer inheritance are defined in §12 above.

## Targeted venue changes, operational impact and effective attendee venues

23 October 2026. Backend paths below are forwarded through the existing authenticated BFF. All mutation bodies use the read version and a reason. Exact mutation retries should retain `Idempotency-Key`.

| Method / path | Current contract |
| --- | --- |
| `POST /events/{id}/venue-change-reviews` | Current Coordinator approves one `CHANGE`, `CANCEL` or `REPLACEMENT`: Event `version`, `bookingId`, `bookingVersion`, `reason`, exact `proposed` fields. Returns `reviewId`; reopens Planning and supersedes current Safety, retaining its history and unrelated sign-offs. |
| `PUT /venue-bookings/{id}` | Independent change/cancellation. Approved source needs `changeReviewId` (existing recorded Safety cancellation review remains supported). Last effective venue needs `confirmLastVenue:true`. Only the affected interval is released/re-reviewed. `DELETE` remains405. |
| `POST /venue-bookings/{id}/replacements` | Versioned fresh request with `Idempotency-Key`, source review when approved and normal room requirements. Links the affected original; excludes its unavailable venue. Approval additionally checks `originalVersion` and atomically marks the original Replaced. |
| `POST /venue-bookings/{id}/resubmit` | Expired source only; distinct ID and fresh hold after current suitability/conflict checks. Links `resubmittedFromId`; preserves original history. A never-approved replacement returns409 `REPLACEMENT_REVIEW_REQUIRED`: request a freshly reviewed replacement from its affected original. A completed replacement may resubmit as an ordinary request only with durable proof of that exact approval and a still-Replaced original; its retained source preserves the historical link. |
| `POST /venue-bookings/impact-preview` | Staff-only positive operational interval; returns every overlapping active hold/booking, buffered occupied windows and `impactFingerprint`. Include `bookingId` when changing an existing block. |
| `POST /venue-bookings`, `PUT /venue-bookings/{id}` for operational rows | `BLOCKED`/`UNAVAILABLE`; `unavailabilityCategory`, optional private `unavailabilityNote`. An affected save requires `confirmImpact:true` plus the current preview fingerprint. Stale/missing proof returns409 `IMPACT_CONFIRMATION_REQUIRED` with fresh impact. |
| `POST /venue-bookings/{id}/restore` | Staff `version`, `confirm:true`, `reason`. Current Coordinator must first explicitly withdraw any pending replacement. Rechecks every buffer minute and current suitability. Replaced originals return409 `BOOKING_REPLACED`. |
| `GET /internal/events/{id}/public-venues` in Booking | Private sanitized effective venues/primary projection, only for a current Confirmed/Preparation Event with approved Safety and ready venues. No notes, requirements, booking history or private Safety data. |
| `GET /internal/attendee-events` in Event | Private source projection of current confirmed/Safety-approved actual Event identities. Attendance combines it with effective rooms and its existing registration policy without rewriting registrations. |

Booking's committed outbox maps cancellation/change/restoration/replacement approval into current-recipient inbox notices and idempotent append-only Event history. `BookingCancelled` and `BookingChanged` target active Staff for affected venues. Restored/pending replacement messages go to current Coordinator/Organiser. Confirmed material venue changes notify eligible registered/waiting Attendees only after the new Safety round and Event reconfirmation; initial approvals and unresolved issues do not notify Attendees. Operational periods display local dates/times with the venue timezone; raw instants remain in structured notice data. The broker bindings, stable message ID, publisher confirms, manual ACK, receipts and dead-letter policy are unchanged.

Completed replacement history does not force another original-to-Replaced transition when that approved room later undergoes an ordinary reviewed change. Public closure period/category edits refresh the affected booking's actionable notice once even if its flags are unchanged; private-note-only edits do not. Delivery compares the exact current overlapping closure facts and suppresses superseded periods/categories, including retained flags after closure removal. The most recent notice facts follow the committed booking version, independent of transaction timestamps.

The UI retains an ambiguous save's exact method, path, key and body after a lost acknowledgement, including after switching calendar forms. A definite version refusal refreshes the source: an uncommitted stale Event review gets a new reviewed intent, and a changed booking closes its obsolete cancellation dialog. Unknown503 outcomes retain the original identity and any known successful review ID.

Current codes use `CONFIRMED`, `TENTATIVELY_HELD`, computed `EXPIRED`, and `REPLACED`; older illustrative `APPROVED`, `RELEASED`, `PENDING_VENUE_REVIEW` and validation400 test text must be reconciled to the actual contract without weakening its assertions. Validation is422; conflicts/expiry/stale versions are409; authorization is403. Whole-Event CS-54 cancellation is still a separate peer dependency and is not claimed by per-booking success.

Attendance’s public Event list/detail is a whitelist of current published details for every authenticated role; saved internal/Safety fields are never merged into it. `GET /attendances/events/:id/organiser` additionally requires the current Event owner and an Organiser role. Legacy public `POST /attendances/events` returns405 (`Allow: GET`) and cannot create or overwrite Event/registration-policy rows; Event creation and registration commands retain their service owners.

Final venue-change delivery compares the current Safety snapshot with the highest round referenced by an earlier committed `EventConfirmed` outbox entry. Unpublished approvals do not change that baseline; reverting to the last confirmed arrangement does not create a false change notice.

The private Attendance notification-recipient lookup includes stored `CONFIRMED` (Registered in the UI), `WAITLISTED` and `OFFERED` registrations, deduplicates user IDs and excludes `WITHDRAWN`, `EXPIRED`, `REJECTED` or any other state. Final change delivery never modifies registration state or reruns registration commands. Kong routes only the public `/attendances/events` and `/attendances/registrations` namespaces; `/attendances/internal/*` is unroutable even with a valid service key.

The private cancellation contract now supports pre-final venue release:

| Service / route | Contract |
| --- | --- |
| Event `POST /internal/events/{id}/cancellation-intents` | Internal key **and** verified current-Coordinator bearer session. Exact body `{eventRequestId,eventVersion,requestVersion,cancellationActionId,reason}`. Accepts permitted Planning/Confirmed Events before their start; locks request then Event, persists one immutable intent/action, enters `CANCELLING` and invalidates current Safety atomically. No final cancellation outbox is written. The action ID binds the original body and actor; exact retry returns the same acceptance. |
| Event `GET /internal/events/{id}/cancellation-context?actionId=...` | Internal-key proof of the exact immutable accepted intent and activity. Returns accepted `eventVersion`, source versions, actor and `phase`, with current source version separate. The existing already-terminal row/action/`EventCancelled` proof remains compatible for legacy recovery. |
| Booking `POST /internal/events/{id}/cancellation-release` | Internal key; body `{eventVersion,cancellationActionId}` uses the **accepted** Event version. Verifies Event's proof before first release; atomically releases only that Event's active venue holds/bookings, full buffered intervals, local readiness fences, history and durable receipt. Exact receipt replay requires no live Event lookup. Different input under the same identity is409. |

The venue receipt includes `receiptId`, `resource:VENUE`, Event/request/action identity, accepted `eventVersion`, `phase`, `releasedAt`, booking IDs and their advertised/occupied intervals. Pre-final `VenueCancellationReleased` outbox entries append Event history only; they do not announce an already-Cancelled Event. The existing terminal-source component remains TC-CS88-16. TC-CS88-18 covers actual acceptance and pre-final release/recovery, including retained unrelated resources and no false final notices.

TC-CS88-06 still requires Javier's public CS-54 request/decision/orchestration, Alan's equipment release/registration closure and the integrated failure/restart journey. Keep public `Cancelling` until **every required resource receipt** completes; only then commit final `CANCELLED` and one `EventCancelled` containing `eventRequestId`, Event/action/version and actor context, followed by final notices. A venue receipt alone cannot complete the Event. See the [cancellation handoff](sprint3-integration-handoff.md#sprint-4-continuation--23-october-2026).

## CS-52 attendee notification contract

27 October 2026 (Marc). notification-service owns the Attendee templates; attendance-service owns the recipient list. Producers publish to `connectsphere.events` through their committed outbox; the outbox row ID is the message ID.

| Message (`type`) | Producer | Required payload | Attendee notice |
| --- | --- | --- | --- |
| `RegistrationCreated` | Attendance (live) | `eventId`, `eventName`, `eventVersion`, `userId`, `registrationId`, `occurredAt` | `REGISTRATION_CONFIRMED` to `userId` only |
| `RegistrationWaitlisted`, `WaitlistOfferMade`, `WaitlistOfferExpired`, `WaitlistOfferAccepted` | Attendance (not in Release 1: CS-48 excludes the waitlist) | same as above | `REGISTRATION_WAITLISTED`, `WAITLIST_OFFER_MADE`, `WAITLIST_OFFER_EXPIRED`, `WAITLIST_OFFER_ACCEPTED` to `userId` only |
| `RegistrationWithdrawn` | Attendance (CS-49, pending) | same as above | `REGISTRATION_WITHDRAWN` to `userId` only |
| `EventConfirmed` with `attendeeMaterialChange` or `attendeeVenueChanged` | Event (live, Safety confirmation) | `eventId`, `eventVersion`, `roundId`, `startAt`, `endAt`, `timeZone`, `venueNames` | `EVENT_CHANGED` or `VENUE_CHANGED` to every active Attendee |
| `EventCancelled` | Event (CS-54 saga, pending) | `eventId`, `eventRequestId`, `eventVersion`, `cancellationActionId`; optional `attendeeRecipientIds` | `EVENT_CANCELLED` to every active Attendee |

Rules:

- **Active Attendees** come from `GET /internal/events/{id}/notification-recipients` (internal key, read-only): `CONFIRMED`, `WAITLISTED`, `OFFERED`. Withdrawn Attendees are skipped. For `EventCancelled`, the publisher should attach `attendeeRecipientIds` captured when the cancellation was accepted, because closing registrations may change their status. Without it, the lookup is used.
- **Never pending.** `EventConfirmed` is delivered only while the Event is `CONFIRMED`/`PREPARATION` with Safety `APPROVED` for the same `roundId`. `EventCancelled` is delivered only with an exact `CANCELLED` cancellation proof. Replacement, restoration, change and Safety steps notify planners only. `VenueUnavailable` tells the Organiser at once (`VENUE_CHANGE_NEEDED`), never Attendees.
- **Privacy.** An Attendee notice carries only the Event name, Event ID, Event version, time and the final schedule/venue names. It has no planning request ID, statuses, Safety/planning comments, evidence or other Attendees, and links to `/attendances/events/{id}`.
- **Retries.** A notice is unique per (message ID, recipient, notice type). Redelivery creates no second notice. A distinct effective change is a new message and a new notice. Delivery only reads the recipient list; it never re-runs a registration or withdrawal command.
