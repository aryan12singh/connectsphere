# Sprint 2 API contract — shared conventions

Status: **agreed draft for review** (Sprint 2 story "Agree the interfaces"). Frontend and
backend build against this in parallel. Per-service detail is in each service's OpenAPI file:

| Service | OpenAPI file | Public via Kong |
|---|---|---|
| auth-service | `services/auth-service/docs/openapi.yaml` (+ Sprint 2 section below) | `/auth/*`, `/admin/*` |
| user-service | `services/user-service/docs/openapi.yaml` (public routes at the end) | `GET /users/*` only |
| event-service | `services/event-service/docs/openapi.yaml` | `/event-requests/*`, `/events/*` |
| venue-service | `services/venue-service/swagger.html` (owned by the venue epic) | `/venues/*` |

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

* Same key + same caller + same body within 24 h → the **original response is replayed**
  (status and body), with the header `Idempotent-Replayed: true`. Nothing runs twice.
* Same key + **different** body → 422 `IDEMPOTENCY_KEY_REUSED`.
* Decisions (approve / reject / return), resubmit and reassign take **no** key. The status guard and
  the `version` check protect them, so a repeated approval is a 409, not a replayed 200 (story CS-12).
* No key on a create → the call simply runs once per request.
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
    "permissions": ["events.create", "events.view", "attendance.register"]
  }
}
```

* `roles` (array, never empty) is the source of truth. `permissions` is the **union** of the roles' permissions.
* `role` is **deprecated** — the first/primary role, kept only so the current frontend keeps working.
  It will be removed once the BFF and auth-service read `roles`.
* `organisationId` is `null` for users without one.
* Register / login / logout are otherwise unchanged. Sign-up still creates `ATTENDEE` only.

## 11. Gateway map

| Path prefix | Goes to | Notes |
|---|---|---|
| `/auth/*`, `/admin/*` | auth-service | login rate-limited 10/min, register 5/min |
| `GET /users/*` | user-service | read-only; `/internal/*` never routed |
| `/event-requests/*`, `/events/*` | event-service | `POST /events/{id}/confirm` → orchestrator (CS-31) |
| `/venues/*` | venue-service | |
| `/venue-bookings/*` | booking-service | Built. Coordinators create, Venue Staff decide status; `POST /venue-bookings/{id}/decision` → orchestrator (not built) |
