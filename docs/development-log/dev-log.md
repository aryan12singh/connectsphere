# ConnectSphere — development log

A running record of what has been built, the decisions behind it, and what
is still open. **Read this before starting any new feature** so work stays
consistent. Add a new dated entry at the top of "Entries" each time.

---

## Standing rules (apply to every feature)

- **Microservices, not a monolith.** One folder per service under
  `services/<name>-service`, each with its own `package.json`, `Dockerfile`,
  `prisma/schema.prisma` and its own database. No shared Prisma schema, no
  `packages/database`.
- **No cross-database foreign keys.** A reference to another service's row is
  a plain UUID column with a `// ref: <service> <table>.id` comment. Fetch the
  row by calling that service's `/internal/...` API.
- **Stack:** plain JavaScript (CommonJS) + Express 5, Prisma 6 with
  `engineType = "client"` and the `@prisma/adapter-pg` driver adapter,
  PostgreSQL 16 (inspect with pgAdmin4), Kong (DB-less, `gateway/kong/kong.yml`),
  Swagger (`docs/openapi.yaml` per service), Docker Compose (`infra/`),
  Keycloak for passwords, RabbitMQ only for notifications, Playwright later.
- **Keep code simple and commented.** Other devs must be able to follow it.
- **Security defaults for every service:** `helmet()`, JSON body limit 10kb
  (venue/booking use 50kb),
  generic error messages (details only in logs), `/internal/*` routes guarded
  by the `x-internal-api-key` header and never routed by Kong.
- **RBAC is permission-based.** Five fixed roles (`EVENT_ORGANISER`,
  `EVENT_COORDINATOR`, `VENUE_STAFF`, `TECHNICAL_SUPPORT_STAFF`, `ATTENDEE`,
  stored in user-service). Routes check a **permission and fixed action-role boundaries**, then record relationships:
  `requireAuth` then `requirePermission('area.action')`. The permission
  catalog is in `auth-service/src/lib/permissions.js`. Which roles have
  which permissions is in `auth_db.role_permissions`, editable by tech support.
- **TECHNICAL_SUPPORT_STAFF is the admin role.** No separate ADMIN role.
- **Business rules that may change go in admin settings, not constants**
  (`auth_db.auth_settings`, `PUT /admin/settings`), so the customer's changing
  requirements don't need a code change.
- **Every admin action writes to the audit log** (`auth_db.audit_logs`).
- **Timestamps are UTC** in every database. In pgAdmin4 use
  `now() at time zone 'utc'`.
- **Ask when a business rule is unclear** instead of guessing.
- Seed data: user, auth and event seeds live in
  `services/<name>-service/prisma/seed/`; venue and booking seeds live in
  `backend/seed_data/` (03_venue_db.sql, 04_booking_db.sql). The compose
  `seed` service (`infra/seed/run-seeds.sh`) loads user, auth, venue and
  event automatically after each service has migrated. **booking_db is not in
  that list yet** (see 2026-10-07). Each seed user has their own password
  (row comments in 01_user_db.sql); mock-mode users use `Password123!`.
- **Line endings:** commit with LF. `.gitattributes` forces LF for `*.sh`,
  `Dockerfile`, `*.yml`, `*.yaml`, `*.sql`. A Windows editor that saves other
  files as CRLF makes `git status` show whole-file changes with no real edit.

## Service map (current)

| Service | Database | Status |
|---|---|---|
| user-service | user_db | Built (internal: lookup, list, create, update role/active). Schema has multi-role `roles[]` + organisations (2026-10-06). Public `GET /users/*` routes are in Kong and the contract but **not built** |
| auth-service | auth_db | Built (attendee sign-up, login, logout, me, password policy, internal validate, admin API). Does **not** return `roles`/`organisationId` yet (Sprint 2 contract §10) |
| venue-service | venue_db | Built (PR #5): venue CRUD, operating hours, history, options. Swagger: `services/venue-service/swagger.html` |
| booking-service | booking_db | Built (PR #5): bookings/blocks, idempotent create, status rules, history, availability, internal venue-links |
| event-service | event_db | **Scaffold only** (PR #6): schema, migrations, seed, domain rules + 89 unit tests, OpenAPI contract. Only `/health` answers; every other route is 404 |
| frontend (Nuxt BFF) | — | Auth (login, sign-up, permissions, admin proxy) + venue workspace and booking pages (live mode). Event pages still use mock data |
| Keycloak | keycloak_db | Stores its accounts in Postgres (since 2026-10-01) |
| orchestrator / attendance / messaging / notification | own db each | Not started (`not-built-yet` profile). Kong already routes two orchestrator paths, which answer 503 until it exists |

---

## Entries

### 2026-10-07 — Review and end-to-end test of PR #4, #5 and #6

Reviewed `main` at `6a31cae` (after PR #6). Checked each feature, ran every
test suite, and ran the whole stack end to end.

**How it was tested.** Docker images could not be pulled in the review
environment, so the stack ran natively with the same settings as
`infra/docker-compose.yml`:
- PostgreSQL 16 with all ten databases; every migration and every seed file loaded.
- **Real Keycloak 26.3 on Postgres** (`keycloak_db`). The realm file imported
  on first start, which confirms the 2026-10-01 change.
- Real user, auth, event, venue and booking services.
- A stand-in for Kong built from `gateway/kong/kong.yml` (same routes,
  methods, header stripping and rate limits; no CORS).
- Nuxt in live mode, driven by Playwright.
- Not covered: the Docker builds themselves, `prisma migrate deploy` (the SQL
  was applied directly), and real Kong.

**Results**

| Suite | Result |
|---|---|
| venue-service unit (`npm run test:unit`) | 40 / 40 pass |
| booking-service unit | 32 / 32 pass |
| event-service unit (`npm test`) | 89 / 89 pass |
| venue-service HTTP contract (Python) | 10 / 10 pass |
| booking-service HTTP contract (Python) | 11 / 12. Fails: `test_venue_staff_cannot_create_without_auth_service_create_permission` (see finding 4) |
| frontend `npm test` | 91 pass, 25 fail. Was 20 known fails; **5 new** (see finding 5). CS-33/34/35 specs pass |
| `nuxt typecheck` | clean |
| `tests/specs/signup.spec.ts` | 7 / 7 pass, but the file is **not in the repo** (see finding 9) |
| API end to end (52 checks through the gateway) | 35 pass, 8 fail, 9 notes. The 8 fails come from findings 1–3 |
| UI end to end (Playwright, 15 checks) | 15 / 15 pass |

What works end to end:
- All 20 seed users log in with their own passwords against real Keycloak.
- Lockout after 5 wrong passwords works.
- Sign-up through the gateway and through the `/signup` page creates an ATTENDEE.
- Settings changes reach Keycloak.
- Tech support can create, disable and change the role of a user. The new
  `users_sync_roles` trigger keeps `roles` in step with `role`.
- Venue staff land on `/venue`, see the seeded venues, can edit a venue (the
  reason is asked in a popover), and can approve a pending booking request.
- Coordinators can view venues but not edit them.
- Organisers, attendees and tech support are kept out of `/venue`.
- Venue and booking permission checks all behave:
  - 401 with no token; 403 for the wrong role.
  - A coordinator cannot create a CONFIRMED booking, cannot read another
    coordinator's booking, and cannot change a CONFIRMED booking.
  - Idempotency-Key is required.
  - Hours changes need a reason.
  - Field-level 422 errors are returned.
  - Forged `x-test-user-id` headers are ignored outside test mode.

**Findings (most important first). Nothing was changed; these are for the team.**

1. **Deleting a venue always fails in Docker (503).** `venue-service` has
   no `BOOKING_SERVICE_URL` in `docker-compose.yml`, so it calls
   `http://localhost:3001` inside its own container. Verified: with the URL
   set, delete returns 204 when the venue has no bookings and 409
   `VENUE_HAS_BLOCKING_BOOKINGS` when it has one.
   - Fix: add `BOOKING_SERVICE_URL: http://booking-service:3000` under venue-service.
2. **Idempotent booking retries return 409 instead of the first booking.**
   `findIdempotency` compares the new request with the stored row. The
   stored dates come back as `…T02:00:00.000Z`, so a retry only matches when
   the client sent exactly that format. In practice:
   - `…Z` without milliseconds → 409.
   - `+08:00` (the format `api-contract.md` §3 asks for) → 409.
   - The Nuxt UI is unaffected because it sends `toISOString()`.
   - Unit tests miss this because memory mode stores the raw string.
   - Fix: normalise `startAt`/`endAt` with `new Date(x).toISOString()`
     before fingerprinting.
3. **Creating a venue with operating-hour ids that already exist → 500.**
   `createVenue` trusts `hour.id` from the request. Fix: ignore client ids on
   create (always generate them).
4. **Conflicting rule: may Venue Staff create bookings?** The route allows
   `venue_bookings.decide` to create, which CS-35 needs for BLOCKED periods.
   The contract test says Venue Staff must get 403. One of them must change.
   The test looks outdated. **Team to decide.**
5. **5 frontend tests broke in PR #5** (CS-10 TC-CS10-03 and four CS-30
   cases). `server/api/events.get.ts` now calls `getQuery`, which these
   tests do not stub (`ReferenceError: getQuery is not defined`). The app
   itself works. Fix: add `vi.stubGlobal('getQuery', getQuery)` in those
   tests, or `import { getQuery } from 'h3'` in the route.
6. **Booking conflicts are only checked in the browser.** The server
   accepted a coordinator booking inside a BLOCKED period (201).
   - TC-CS35-06 says this is client-side by design. But any API client
     (Postman, a script) can double-book.
   - Recommend a server-side overlap check against BLOCKED, TENTATIVELY_HELD
     and CONFIRMED. **Business rule needed.**
7. **Availability shows other coordinators' bookings in full.**
   `GET /venue-bookings/availability` returns every booking for the venue,
   including `requestedById`, `title` and `reason`. TC-CS34-04 says
   coordinators should see only permitted details. Recommend returning only
   times and status for bookings the caller does not own.
8. **booking_db is not seeded automatically.** `infra/seed/run-seeds.sh`
   lists user, auth, venue and event only. Also, two different files are
   numbered 04 (`04_booking_db.sql` and `04_event_db.sql`). Fix: add a
   `booking_db|venue_booking_requests|/seed/backend/04_booking_db.sql` line
   and `booking-service` to the seed service's `depends_on`; renumber one file.
9. **Things that were lost in the PR #4 merge.**
   - `tests/specs/signup.spec.ts` (7 passing sign-up tests) was never
     committed.
   - `services/auth-service/.env.example` and `user-service/.env.example`
     now have empty `DATABASE_URL` (and an empty `INTERNAL_API_KEY` in
     user-service), so `npm start` outside Docker fails until filled in.
   - `frontend/.env.example` now defaults to `NUXT_AUTH_MODE=live` and still
     says the seed password is `Password123!` (each seed user has their own).
10. **`how-to-run-and-test.md` was garbled by the PR #5 merge.**
    - Part B2 starts mid-way through B1 (the Keycloak upgrade note and the
      Kong restart now sit inside B2).
    - The log-watching step appears twice.
    - It does not mention event-service, the automatic `seed` service, or
      that booking seeds must be loaded by hand.
11. **Friendly error messages were dropped from `server/utils/backend.ts`**
    (PR #5).
    - The 502/503/504 → "The ConnectSphere service is unavailable…"
      mapping is gone.
    - So is the fallback to Kong's `message`. A Kong 429 or 502 now shows
      "Request failed" (the sign-up page still special-cases 429).
12. **Routes in Kong or the contract that have no code behind them.** These
    all answer 404 or 503 today:
    - `GET /users/*` (user-service has no public routes).
    - All `/event-requests/*` and `/events/*` routes.
    - The two orchestrator routes (`/venue-bookings/{id}/decision`, `/events/{id}/confirm`).
    - Expected for unbuilt stories. Listed so nobody thinks they are broken.
13. **Smaller items**
    - **Internal route through Kong:** `/venues/{id}/internal` sits under
      `/venues`, so Kong routes it publicly. It is still protected by the
      internal key (403). The standing rule is `/internal/*` paths only;
      consider moving it.
    - **Test identity headers:** venue- and booking-service accept
      `x-test-user-id` / `x-test-role` when `AUTH_MODE=mock` or
      `NODE_ENV=test`. Never set either in compose. Kong does not strip these
      headers.
    - **Delete venue:** "Delete venue" deletes immediately, with no
      confirmation step.
    - **Fake pagination:** the venue list shows static "1 … 3" pagination
      that does nothing.
    - **Raw ids in booking requests:** the Booking requests tab shows venue,
      organiser and coordinator ids instead of names.
    - **Nav and buttons by role:**
      - The top nav shows Venues and Equipment to every role. An organiser
        clicking Venues is sent back to `/`.
      - Venue staff see a "New event request" button they cannot use.
    - **Organiser field:** the booking request card's "Organiser" field
      shows the coordinator's id.
    - **Dangling reference:** `event-service/prisma/schema.prisma` points to
      `schema-decisions.md`, which does not exist.
    - **Stale Kong comment:** `kong.yml` mentions `/venues/{id}/blocks` and
      `/venues/{id}/availability`, which do not exist. Blocks are bookings
      with status BLOCKED.
    - **Line-ending noise:** the working copy that was reviewed had 115 files
      with CRLF-only changes and no real edits. Run `git restore .` (or
      `git add --renormalize .`) before committing, so a commit doesn't
      rewrite whole files.

**Still open from earlier entries.**
- Auth-service does not return `roles` / `organisationId` (contract §10).
  Priya's `/auth/me` still shows only `role: EVENT_ORGANISER`.
- The `role` → `roles` switch needs auth-service, the BFF and the frontend
  together.
- The access matrix still lacks rows for sign-up, the admin API, venues and
  bookings.
- Rate limits count per calling IP. Through the BFF that is the Nuxt server,
  so they apply to the whole site.

### 2026-10-06 — Event-service groundwork, multi-role users, organisations (PR #6, javierseah)

Sprint 2 groundwork for CS-10/11, CS-30 (assignment), CS-32 (status guard),
CS-12 (approve), CS-28 (reject/return) and CS-44 (activity history). **No
event API is built yet:** `src/app.js` only has `/health`.

**event-service (new)**
- Prisma schema and migration for:
  - `EventRequest` (DRAFT → SUBMITTED "Under Review" → RETURNED_FOR_AMENDMENT
    / APPROVED / REJECTED).
  - `Event` (ARRANGEMENT_PENDING "Planning" → CONFIRMED / CANCELLED /
    COMPLETED / REJECTED).
  - `CoordinatorAssignment` (AUTO or REASSIGNED; one current coordinator
    per request).
  - `ActivityLog`, `Outbox` (domain events written in the same transaction)
    and `IdempotencyRecord`.
- `src/domain/transitions.js`: one guard that encodes the whole status table.
  - Check order: 403 wrong person → 409 wrong status → 422 bad input → 409
    conditions.
  - A multi-role user can never decide on their own request.
- `src/domain/assignment.js`: least-loaded coordinator.
- `src/domain/statusLabels.js`: the one shared label map.
- 89 unit tests.
- `docs/openapi.yaml`: the agreed contract for `/event-requests`
  (create, review-queue, get, submit, resubmit, decision, reassign, activity)
  and `/events`.
- Seed `prisma/seed/04_event_db.sql` (event requests in every status).

**user-service:** migration `20261002000000_roles_and_organisations`.
- Adds an `organisations` table, `users.roles` (array, source of truth) and
  `users.organisationId`.
- `role` stays as a deprecated "primary role".
- A trigger (`users_sync_roles`) keeps `roles` in step when old code changes
  only `role`.
- Checks: at least one role, and `role` must be inside `roles`.
- Seed changes:
  - Sarah and Daniel share Nexus Labs (Daniel's company changed from
    BrightPath Academy).
  - Priya is the multi-role example (EVENT_ORGANISER + ATTENDEE).

**Shared docs and infra**
- `docs/api-contract.md` (new): Sprint 2 conventions.
  - Identity headers `x-user-id`, `x-user-roles`, `x-organisation-id`,
    stripped by Kong. Each service gets them from
    `/internal/sessions/validate` today.
  - UUID ids; ISO 8601 times with an offset (a time without one is a 422).
  - Error shape; idempotency on creates only; `version`-based concurrency;
    lists of 20 per page.
  - Outbox; auth-service additions (`roles`, `organisationId`); the gateway map.
- Kong:
  - The `request-transformer` plugin strips the identity headers.
  - New public `GET /users` route.
  - The event-request decision moved from the orchestrator to event-service.
- docker-compose:
  - event-service is now built (port 3003).
  - New one-shot `seed` service running `infra/seed/run-seeds.sh`.

**Decisions (proposed, need team sign-off).** These were written in
`docs/decisions-sprint2-events.md`, which was deleted in the next commit.
It can still be read with
`git show e129741:docs/decisions-sprint2-events.md`. Summary:
- **D1 Unassigned requests.** An unassigned SUBMITTED request shows
  "Awaiting assignment". Every coordinator sees it and can claim it via
  `/reassign`.
- **D2 Idempotency-Key on creates only.** Accepted on create and submit
  only. A repeated approval returns 409.
- **D3 Coordinator load and tie-break.**
  - "Active" load counts SUBMITTED, RETURNED and APPROVED requests whose
    event is in Planning or Confirmed.
  - Ties go to the longest-serving coordinator (earliest `createdAt`), then
    the lowest id. This replaces story 3's "assigned least recently".
- **D4 Reject from Planning** closes both the request and the event
  (new `EventStatus.REJECTED`).
- **D5 Cancel** changes only the event.
- **D6 Approve after the event date** fails with 409 `EVENT_DATE_PASSED`
  (compared by calendar day in the event's time zone).
- **D7 Confirm** needs an empty list of outstanding arrangements; an unknown
  list counts as blocked.
- **D8 Not exposed yet:** cancel and "significant change approved" are in
  the guard but have no endpoint.
- **D10 Activity lists:** newest first, 20 per page.
- **D11 Activity entries:** submit → return → resubmit logs 4 entries
  (including "coordinator assigned").
- **D12 Resubmit changes:** the resubmit entry lists the changed fields.
- **D13–D19:**
  - Identity comes from the headers.
  - The stack stays the same.
  - A `version` column handles concurrency.
  - One current coordinator per request.
  - Reasons are 1–500 characters, trimmed.
  - The outbox is written in the same transaction.
  - There is one shared status label map.
- Follow-ups listed there:
  - Update `access-matrix.md` for D1.
  - Reword test cases 30-06 and 44-01.
  - Update the frontend label map.

### 2026-10-05 — Venue management, venue bookings and availability blocks (PR #5, Alan Sebastian Bun)

Stories CS-33 (manage venue records), CS-34 (availability calendar) and
CS-35 (availability blocks). Each has `tests/records/CS-3x/test-cases.md`
and `tests/specs/CS-3x.spec.ts`.

**venue-service (new, venue_db)**
- Routes (Kong `/venues`):
  - `GET /venues/options`; `GET`/`POST /venues`.
  - `GET`/`PUT`/`DELETE /venues/{id}`.
  - `GET`/`PUT /venues/{id}/operating-hours` (a reason is required; the list
    may not be empty).
  - `GET /venues/{id}/history`; `GET /venues/{id}/internal` (internal key).
- Permissions: `venues.view` to read, `venues.manage` to change. Checked via
  auth-service `/internal/sessions/validate`.
- Capacity limit comes from `MAX_VENUE_CAPACITY` (default 10000).
- Every change writes `venue_history` with actor, role, reason and the changes.
- Delete asks booking-service how many blocking bookings the venue has
  (TENTATIVELY_HELD or CONFIRMED that end now or later):
  - If there are any → 409 `VENUE_HAS_BLOCKING_BOOKINGS`.
  - If booking-service cannot be reached → 503 (fails closed).
- Validation errors are 422 `{ error: { code: 'VALIDATION_ERROR', fields } }`.
- `DATA_MODE=memory` is for tests; compose uses `prisma`.
- Docs and tests: Swagger page `swagger.html`, a Postman collection, 40 unit
  tests and 10 Python HTTP contract tests.

**booking-service (new, booking_db)**
- Routes (Kong `/venue-bookings`):
  - `GET`/`POST /venue-bookings` (POST requires an `Idempotency-Key` header).
  - `GET`/`PUT /venue-bookings/{id}`.
  - `GET /venue-bookings/history?venueId=`.
  - `GET /venue-bookings/availability?venueId=&startAt=&endAt=`.
  - `GET /internal/venue-links/{venueId}`.
- Statuses: AVAILABLE, TENTATIVELY_HELD, CONFIRMED, BLOCKED, UNAVAILABLE,
  REJECTED, CANCELLED.
- Rules (`src/policy.js`):
  - Coordinators (`venue_bookings.create`) create TENTATIVELY_HELD (or
    CANCELLED) bookings, and these need an `eventId`.
  - Coordinators see and edit only their own bookings, and only while they
    are tentative or cancelled.
  - Venue staff (`venue_bookings.decide`) may create and set any status,
    including BLOCKED periods (CS-35), and see all bookings.
- Every change writes `venue_booking_activity`.
- Conflict detection is **client-side only** (`conflictDetection: 'client-only'`).
- Docs and tests: Swagger page, a Postman collection, 32 unit tests and 12
  Python contract tests.

**Shared**
- `services/utils/role-permissions.js` mirrors the default role permissions.
  It is used only by the test/mock identity adapters. Each service copies it
  in its Docker image.
- Both services are built with `context: ../services` so they can include `utils/`.

**Frontend**
- New pages:
  - `/venue`: venue list, week/day calendar, details, delete, "Booking
    requests" tab for venue staff.
  - `/venue/new` and `/venue/{id}`: the venue form; the reason is asked in a
    popover before saving.
- Components live in `app/components/venue/`. New shared error alert
  (`AppErrorAlert`, `useErrorAlert`, `api-error.ts`) and a sonner toast.
- BFF proxies (`server/utils/kongBff.ts`) forward the session token to Kong.
  The browser only calls `/api/*`.
  - `/api/venues/*` maps to `/venues/*`.
  - `/api/bookings/*` maps to `/venue-bookings/*`.
  - `/api/venues/{id}/history/combined` merges venue and booking history,
    newest first.
  - Contract: `docs/frontend-bff-venue-booking.md`.
- `auth.global.ts`: venue staff now go to `/venue` instead of `/login`.
  Coordinators reach `/venue` through the existing page-permission check
  (`definePageMeta({ permission: 'venues.view' })`).
- `/api/events?scope=booking`: event options for the booking form (still
  mock data).
- `backend.ts` can send extra headers (Idempotency-Key). Its error mapping
  changed (finding 11 above).

**Seeds**
- `backend/seed_data/03_venue_db.sql`: 3 venues with hours and history.
- `backend/seed_data/04_booking_db.sql`: 7 bookings, one in each status.

**Docs:** the run guide (B1/B2 seed steps, a Postman section), the ERD
(`docs/erd/schema-updated.prisma`) and the frontend agent skill.

### 2026-10-02 — Login and auth merged to main (PR #4, Marcang0802)

Everything from 2026-09-28 to 2026-10-01 below was merged as PR #4
(`a625a23`). Differences from the reviewed working copy:
- `tests/specs/signup.spec.ts` was left out.
- The `.env.example` files were changed (finding 9 in the 2026-10-07 entry).
- This log lost its last paragraph, which is now restored below.

### 2026-10-01 — Attendee self sign-up + Keycloak data kept in Postgres

**Business rules (confirmed by Shadow)**
- New users sign up on a page; **sign-up is for Attendees only**. Staff
  accounts are still created by tech support.
- The account **works immediately** (no email verification, no approval).
- After sign-up the user is sent **back to the login page** (no auto-login).
- Keycloak's storage moves into Postgres as part of this, so self-created
  accounts survive restarts and rebuilds.

**Backend**
- `auth-service/src/services/account.service.js` (new): one place that
  validates a new account and creates it (Keycloak login first, then the
  user-service profile; if the profile fails, the Keycloak login is deleted).
  Used by both `POST /admin/users` and the new `POST /auth/register`.
- `POST /auth/register` (public): role is forced to `ATTENDEE` (a `role` in
  the body is ignored), returns 201 `{ user }`, creates no session, audit
  action `USER_REGISTERED` (actor = the new user).
- `GET /auth/password-policy` (public): the current password rules from
  `auth_settings`, for the sign-up form.
- Kong: routes `auth-register` (POST, **5/minute**) and `auth-password-policy`.
- Keycloak: `KC_DB=postgres`, database `keycloak_db` (added to
  `init-databases.sh`), waits for Postgres to be healthy. It imports the realm
  file **only when `keycloak_db` is empty**. Consequence: after a realm-file
  change (e.g. seed passwords), reset `keycloak_db` or `down -v` — just
  recreating the Keycloak container is no longer enough. Existing Postgres
  volumes need `CREATE DATABASE keycloak_db` once (run guide, Part B1).

**Frontend**
- `server/api/auth/register.post.ts` (live mode only; mock returns 501):
  forwards only email, firstName, lastName, company, password.
- `server/api/auth/password-policy.get.ts` (mock returns the defaults).
- `app/pages/signup.vue`: labelled fields, rule checklist that ticks as you
  type (screen-reader text for met/not met), confirm-password check, server
  message on error, 429 message, then `/login?registered=1`.
- `app/pages/login.vue`: "Create an account" link and an "Account created.
  Please sign in." message. `auth.global.ts`: `/signup` is public.

**Contracts**: swagger.html v0.3.0 (BFF: `/api/auth/register`,
`/api/auth/password-policy`, `USER_REGISTERED`); auth-service openapi.yaml
v0.4.0 (`/auth/register`, `/auth/password-policy`). Both validated.

**Verified**
- `tests/specs/signup.spec.ts` (new, 7 tests): BFF 501 in mock mode; BFF drops
  `role`/`isActive` and sets no cookie; page blocks mismatched passwords;
  rules follow the server policy; success goes to `/login?registered=1`;
  409 message shown; middleware lets `/signup` through. Full suite:
  **82 passed, 20 failed** (the same 20 known CS-11/CS-30 failures).
- Live (Postgres 16 + both services + Keycloak stand-in + Nuxt live, Playwright):
  sign-up with a `role: TECHNICAL_SUPPORT_STAFF` body → ATTENDEE; duplicate
  and seed emails → 409; weak password → 400 and nothing created; missing
  names → 400; audit row written; new account logs in as ATTENDEE; policy
  change (min 12) shows on the page; user-service down → 503 and the Keycloak
  login is rolled back (no orphan).
- **Not run here (no Docker in my environment):** real Keycloak on Postgres.
  `docker compose config` is valid. Shadow to check MT-27 to MT-35.

**Known trade-offs / flags for the team**
- 409 "email already exists" tells a visitor an email has an account. Kept
  for usability; the rate limit slows abuse.
- Kong rate limits count the caller's IP. Through the website the caller is
  the Nuxt server, so login (10/min) and sign-up (5/min) limits are
  site-wide, not per visitor. Fine for dev; fix before real users (have Kong
  use the forwarded browser IP).
- Attendees still have no interface (stay on /login after logging in), per
  the access matrix. Access matrix needs rows for sign-up and the admin API.
- No story ID for sign-up yet: rename `signup.spec.ts` to `CS-<id>.spec.ts`
  and add a test record when the story exists (DoD Sprint 2).
- Deleting `keycloak_db` deletes signed-up users' logins but not their
  `user_db` rows. There is no "re-sync" script yet.

**Run guide follow-up (same day):** added Part A2 "Starting from scratch"
(`down -v`, check `frontend/.env`) and moved the Kong restart to after the
services report ready, at Shadow's request.

### 2026-10-01 — New seed data: every user has their own password

The team updated `01_user_db.sql` and `02_auth_db.sql`:
- **Users:** each has a unique dev password (listed in the row comment).
  `passwordHash` is computed at load time with pgcrypto
  `crypt(..., gen_salt('bf', 10))`, and the file runs
  `CREATE EXTENSION IF NOT EXISTS pgcrypto` (fine: the `connectsphere`
  user is a superuser in the container).
- **Sessions:** seed tokens were renamed (e.g.
  `seed-dev-token-02-aisha-rahman`). `tokenHash` is computed at load time
  with `sha256()`.

**Why code/config had to change:** Keycloak checks passwords, not
`user_db.passwordHash`. The realm file still gave everyone `Password123!`,
so every seed login would have failed. `infra/keycloak/connectsphere-realm.json`
credentials are now generated from the seed file, and I checked that the SQL
value and the comment agree for all 20. **Rule: when a seed password changes,
update the realm file too, then reset `keycloak_db` (since 2026-10-01; see the sign-up entry).**

**Also in this change**
- Seeds copied to `backend/seed_data/` and `services/*/prisma/seed/`.
- Run guide: a seed user table with passwords; MT-01/MT-21 and the Swagger
  login step use the new passwords. New troubleshooting rows for the Kong
  502 and for the seed-password mismatch. New step: **restart Kong after
  any `up --build`** (it keeps the old container's address, so logins
  502 until restarted; Shadow hit this after `down -v` and a rebuild).
- `frontend/server/utils/backend.ts`: 502/503/504 from Kong now show "The
  ConnectSphere service is unavailable…" instead of "Request failed".
  Other errors fall back to Kong's `message` field.
- Examples updated in swagger.html, openapi.yaml, `.env.example` and
  auth-setup.md. Mock users keep `Password123!`.

**Verified (fresh database, as after `down -v`)**
- init script → migrations → new seeds load cleanly, and loading twice is
  a no-op. The seed's own sanity queries pass.
- 20/20 seed users log in with their own password; the old `Password123!`
  is rejected.
- New seed tokens: the active one is accepted; the expired and revoked
  ones get 401.
- Website live login works for Sarah, Aisha, Hafiz and Mei Ling.
- A 502 from Kong shows the new message.
- Team tests: 75 pass / 20 known failures (unchanged). Typecheck and all
  three specs are clean.

### 2026-10-01 — API contracts updated; sign-out now revokes the backend session

Shadow confirmed live mode works with Keycloak: the first stable version
of login/RBAC/admin.

**Decisions (Shadow)**
- The contract follows the code. The BFF is **cookie-only**; login returns
  `{ user }` with `permissions` and **no token** (as CS-10 and CS-11
  assert). The pre-existing contracts' "dual access" (bearer token) was
  never implemented and is dropped from the auth contract. Hand testing
  goes through the backend Swagger UI (:3002/docs, bearer).
- Teammates' contracts are only flagged, not edited: user-service and
  event-service `swagger.html` still promise bearer "dual access", which no
  BFF route implements.
- Backend internal APIs are documented in `openapi.yaml` (not in the
  frontend pages).

**Bug found and fixed**: the Sign out button (`UserMenu.vue`) calls
nuxt-auth-utils' built-in `DELETE /api/_auth/session`, which only cleared
the cookie. In live mode the backend session stayed valid, so a copied
cookie kept working until expiry. Fix: new
`frontend/server/plugins/revoke-backend-session.ts` hooks
nuxt-auth-utils' `clear` event, so **every** sign-out path revokes the
backend session. It uses the new `revokeBackendSession()` in
`server/utils/backend.ts`, which is not `backendFetch`, to avoid a
401 → clear → hook loop. `DELETE /api/auth` now just calls
`clearUserSession()`. No change to `UserMenu.vue`.

**Docs**
- `services/auth-service/swagger.html` rewritten (v0.2.0, OpenAPI 3.1,
  same page layout and nav as the team's other pages): 14 operations across
  `/api/auth`, `/api/auth/me`, `/api/admin/*` and `/api/_auth/session`.
- `services/auth-service/docs/openapi.yaml` v0.3.0: adds
  `POST /internal/sessions/validate`. Also fixed two errors in my earlier
  version: an unquoted comma split a parameter description, and `const`
  isn't allowed in OpenAPI 3.0.
- New `services/user-service/docs/openapi.yaml`: all internal routes plus
  /health.
- `auth-setup.md` gets an "API documentation" section. MT-03 now also
  checks revocation.

**Verified**: all three specs pass a strict OpenAPI validator. Route
lists match the code exactly (no undocumented routes, no phantom
routes). Live contract check: 29 BFF calls and 14 internal calls, every
status documented and every body matching its schema. `swagger.html`
renders 14 operations in Chromium. Real Sign out button → backend
session revoked; a cookie copied before sign-out is replayed → 401;
disabled-user forced logout still works with no hook loop. Team tests
75 pass / 20 known failures (unchanged); `nuxt typecheck` clean.

**Needs a rebuild**: `docs/openapi.yaml` is copied into the auth-service
image, so run `docker compose up -d --build` to see it at :3002/docs.

### 2026-09-30 — Fix: empty NUXT_SESSION_PASSWORD broke login

`frontend/.env.example` shipped `NUXT_SESSION_PASSWORD=` (empty), and the
run guide said it could stay empty. An empty value makes nuxt-auth-utils
fail to seal the cookie: every login returns 500 "Empty password" (the
login page shows "Invalid credentials"). If the line is absent, it
auto-generates a secret. Fixed `.env.example` (line commented out, with a
warning) and the guide, and added a troubleshooting row. Reproduced both
ways before and after. Missed earlier because every test run set the
variable explicitly.

### 2026-09-28 (repo check) — Repo audit, clean-clone run, run guide

Audited the committed repo (latest commit `d478b83`) against the final
package, then ran it from scratch.

**Result**
- Every delivered file is present and identical to the tested version. No
  teammate frontend or test file changed since. `.env` and `node_modules`
  are not committed.
- Clean-clone run: fresh `npm install`, new database via the repo's
  `init-databases.sh`, migrations, `backend/seed_data` 01/02, services, and
  Nuxt in live mode all work. Team tests: 75 pass / 20 known failures
  (identical to baseline). `nuxt typecheck` clean. `docker compose config`
  valid.
- Browser walkthrough and replay of the manual cases MT-12 to MT-23 pass.

**Fixed in this pass**
- `.gitattributes`: forces LF for `*.sh`, Dockerfiles, yml, sql. A CRLF
  `init-databases.sh` (default Git on Windows) would stop Postgres creating
  the databases.
- `services/*/package-lock.json` added. Dockerfiles use `npm ci`, so builds
  are reproducible.
- Swagger: the same-origin server (3002) is now listed first, so "Try it
  out" works from /docs without CORS errors.
- New `docs/how-to-run-and-test.md`: PowerShell-safe start-up (seed via
  `docker compose cp` instead of `<`, which PowerShell lacks) and 26 manual
  test cases (DoD item 2).
- README: Run section plus links (DoD items 5 and 6). `auth-setup.md`
  install-from-zip steps replaced by a pointer to the run guide.

**Findings needing a team decision** (not changed):
1. `backend/seed_data/access_list (1).xlsx` is committed with **plaintext
   passwords** for 100 accounts (commit `386863c`). No seed uses it.
2. `docs/erd/schema-updated.prisma` still describes "Pattern 2" (user-service
   verifies bcrypt passwords via `/internal/users/verify`; auth-service
   returns `{token}` only). What's built is hybrid Keycloak, plus
   `users.isActive`, nullable `passwordHash`, `sessions.lastUsedAt`,
   `role_permissions`, `auth_settings` and `audit_logs`. DoD item 6 needs
   the contract/ERD updated.
3. DoD item 2 (Sprint 2): **no automated unit tests yet for
   user-service/auth-service**, and no test records under
   `tests/records/<story>/` for the auth work. There is also no CI config
   (`.github/` absent).
4. Access matrix: the tech support admin API is built but not in the matrix.
   "Internal provisioning" is still listed as an open question there, but
   the build assumes tech support creates accounts (Shadow's decision).
   The matrix's own findings #1 (`POST /api/events` has no role check) and
   #2 (`GET /api/users/[id]` has no scoping) are still open in the frontend
   BFF.
5. Tech support / venue staff / attendee see "Signed in as…" and stay on
   /login. This matches the matrix (no interface yet) but is confusing; it
   needs a landing page decision.

### 2026-09-28 (frontend) — Auth wired into the Nuxt frontend

The team's `frontend/` is **Nuxt 4 + TypeScript + shadcn-vue, using a BFF
pattern**: the browser calls only Nuxt `/api/*`, and `nuxt-auth-utils`
seals the session in an httpOnly cookie. The earlier plain-Vue helpers
(`frontend/src/...`, token in sessionStorage, browser calling Kong) did not
fit and were **dropped**. They are replaced by Nuxt-native files:
- `server/utils/backend.ts`: `backendFetch()` (ofetch → Kong; a backend
  401 clears the cookie) and `getSessionToken()`.
- `server/api/auth.post.ts`, `server/api/auth.delete.ts` rewritten with a
  `runtimeConfig.authMode` switch: **`mock` stays the default** so the event
  mocks and the team's tests keep working; `live` uses auth-service.
- **Security fix:** the token was stored at the session's top level, which
  nuxt-auth-utils exposes to the browser via `/api/_auth/session`. It is
  now in `secure` (server-only).
- `server/api/auth/me.get.ts`: validates the backend session and refreshes
  role + permissions. Called once per page load by
  `app/plugins/verify-session.client.ts` (it was first in the middleware, but
  that broke CS-10 TC-CS10-07, which expects no extra calls for a logged-in
  user). Only a 401 logs out; network errors don't.
- `auth.delete.ts` reads the session only in live mode (keeps CS-10
  TC-CS10-04 working, and mock mode has nothing to revoke).
- `server/api/admin/[...path].ts`: proxy to auth-service `/admin/*`. Only
  plain path segments and GET/POST/PUT/PATCH are allowed. Live mode only
  (501 in mock).
- `app/composables/usePermissions.ts` (`can`, `canAny`),
  `app/composables/useAdminApi.ts` (typed admin calls),
  `app/types/page-meta.d.ts` (`definePageMeta({ permission })`).
- Middleware: the team's organiser/coordinator role gate is kept for pages
  without a `permission`.
- Frontend code follows the team's TS style (no semicolons, single quotes).
  The plain-JS rule applies to the backend services only.

**Team test suite (`tests/specs`, vitest):** identical before and after:
75 pass, 20 fail. The 20 failures exist on the untouched frontend too: 19
CS-11 tests call routes that aren't built yet (404), and 1 CS-30 test
expects a disabled "Change coordinator" button. All CS-10 (auth) tests
pass. No test was modified. To run them, `frontend/` and `tests/` must be
siblings inside a git repo (Nuxt uses the `.git` folder to allow `../tests`).

**Tested:** `nuxt typecheck` clean (same as the untouched original). In
live mode through Nuxt: 21 API checks (login, token absent from the
browser-visible session, /me, admin proxy incl. 403, path-trick 400,
DELETE 405, disabled user → 401 + cookie cleared, logout revokes the
backend session, SSR home page, logged-out redirect). In mock mode: 8
checks of existing flows unchanged. In Chromium via Playwright: real login
to "Your events", httpOnly cookie, nothing in browser storage, page
permission gate both ways, reload after the backend session ended → /login.

**Open**
- Tech support's home page (the role gate sends them to /login from `/`).
- In live mode, the event mocks use mock user IDs, so real users see no
  seeded events until event-service exists.
- Kong CORS isn't needed by this frontend (the BFF calls Kong
  server-to-server). Harmless to keep.

### 2026-09-28 (merge) — Final docker-compose.yml and kong.yml

Compared the scaffold's version 1 of both files with this session's
version and merged them into one final version of each.
- **Compose:** restored the 7 not-yet-built services that the session
  version had collapsed into one commented example. All original env vars
  are kept, including the orchestrator's service URLs and the notification
  service's RABBITMQ_URL. They now sit under `profiles: ["not-built-yet"]`,
  so a normal `up` skips them. Each also got AUTH_SERVICE_URL +
  INTERNAL_API_KEY for RBAC. Dropped the obsolete `version:` key. Added
  `restart: unless-stopped` to keycloak and the services. Validated with
  `docker compose config`.
- **Kong:** nothing lost. The v1 `/users` route was removed on purpose
  (user-service is internal only). Every route has `strip_path: false`
  (v1's default would have stripped paths). **Fix found:** orchestrator
  routes were POST-only, which would block browser CORS preflight, so
  OPTIONS was added. Orchestrator routes keep `methods` so they win over the
  broader `/events` and `/venue-bookings` routes.
- To enable a service later: delete its `profiles:` line, then add it to
  Kong's `depends_on`.

### 2026-09-28 (later) — Admin settings, permission-based RBAC, user management

**Decisions (confirmed by Shadow)**
- Admin = **TECHNICAL_SUPPORT_STAFF**.
- **Roles fixed, permissions editable.** Tech support moves users between the
  5 roles and ticks which permissions each role has. No custom roles.
- Tech support user management: **create users, change role, disable /
  re-enable.** Password reset was not requested (not built).
- Configurable without code: **session length, idle timeout, lockout rule,
  password policy.**

**How it works**
- `auth_db.auth_settings` (one row, id 1) holds the settings. Defaults:
  24 h session, idle off, 5 tries, wait 1→15 min, password min 8 with
  upper/lower/digit/special. Saving copies lockout + password rules to
  Keycloak through its admin API **inside a DB transaction**, so if Keycloak
  rejects them nothing is saved. auth-service re-pushes them at start-up
  (retries ~2 min) because Keycloak re-imports the realm file when its
  container is recreated.
- Session length applies to logins **after** the change; idle timeout applies
  to every session immediately (`sessions.lastUsedAt`, written at most once
  a minute).
- `auth_db.role_permissions` holds role → permission. Defaults are inserted by
  migration `20260928130000_admin_rbac_settings`. Protected: tech support
  always keeps `users.manage` and `permissions.manage`.
- `/auth/login`, `/auth/me` and `/internal/sessions/validate` now also return
  `permissions`.
- Create user = Keycloak account first (catches weak password or used email
  early), then user-service profile; if the profile fails, the Keycloak
  account is deleted. Initial password is set by tech support and is **not**
  temporary: Keycloak's "must change password" step would block our login
  form.
- Disable = Keycloak `enabled=false` + `user_db.users.isActive=false` + revoke
  all of the user's sessions. `resolveToken` also rejects inactive users.
- Self-protection: can't change own role or disable self.
- auth-service calls Keycloak's admin API as the `auth-service` client's
  **service account** (roles: view-users, manage-users, manage-realm), added
  to the realm file.
- Kong: `/admin` route, global CORS for `http://localhost:5173`, OPTIONS
  allowed on auth routes for browser preflight.
- Frontend (SUPERSEDED by the Nuxt entry above): `frontend/src/api/http.js` (fetch wrapper, token in
  sessionStorage, 401 clears login), `composables/useAuth.js` (`can()`,
  `canAny()`, login/logout/loadCurrentUser), `api/admin.js`,
  `router/guards.js` (`meta.public`, `meta.permission`).
- `requireRole` removed; use `requirePermission`.

**Schema changes**
- user_db: `users.isActive` (default true), `passwordHash` now nullable.
- auth_db: `sessions.lastUsedAt`, new tables `role_permissions`,
  `auth_settings`, `audit_logs`.

**Admin endpoints (via Kong)**: `GET/POST /admin/users`,
`PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`,
`GET /admin/permissions`, `PUT /admin/roles/:role/permissions`,
`GET/PUT /admin/settings`, `GET /admin/audit-logs`.

**Tested (2026-09-28)** against Postgres 16 with both seed files and a
Keycloak stand-in (password grant, client credentials, admin user and realm
endpoints): 34 API checks (RBAC 401/403, permission edits incl. protected and
unknown, settings validation and Keycloak copy, session length applied,
create/duplicate/weak password, role change seen by an open session,
disable kills sessions and login, self-protection, lockout following the new
setting, audit entries), plus idle timeout (31 min out, 29 min fine),
Keycloak down during a settings save (503, nothing saved), the Keycloak
account undone when the profile step fails, and 14 checks of the Vue
composable, admin API calls and router guard against the live services.
**Still to verify with real Keycloak in Docker:** service account permissions,
realm update via admin API, and create/disable.

**Still open**
- Password reset by tech support (not requested yet).
- Should changing session length also shorten sessions already open?
  (Currently: new logins only.)
- Attendee self-registration in scope?
- Production frontend URL for Kong CORS.

### 2026-09-28 — Authentication and login (backend)

**Decisions**
- **Hybrid Keycloak auth.** Keycloak checks the email + password (password
  grant from auth-service, client `auth-service`, realm `connectsphere`) and
  enforces account lockout. auth-service then issues its **own** opaque
  session token: 32 random bytes, only the SHA-256 hash is stored in
  `auth_db.sessions`. Keycloak's own tokens are discarded.
- Keycloak users are imported from `infra/keycloak/connectsphere-realm.json`,
  generated from `01_user_db.sql`, with the **same user IDs** as `user_db`.
  Login matches on email.
- **Roles live in user-service**, not Keycloak. auth-service loads the user
  fresh on every request, so a role change applies immediately.
- Token sent as `Authorization: Bearer <token>`. Session length: **24 hours,
  fixed** (no idle timeout). Multiple sessions per user allowed. Note: seed
  sessions in `02_auth_db.sql` were written with 7-day expiries, so those
  rows stay valid until their own `expiresAt`. Only new logins get 24 h.
- **Every login failure returns the same 401 "Invalid email or password"**
  (wrong password, unknown email, locked, disabled), so emails can't be
  enumerated. Keycloak itself hides lockout from the password grant.
- Lockout (Keycloak brute-force detection): 5 failures, then a wait
  starting at 60 s, rising to at most 15 min. Not permanent.
- Kong rate-limits `POST /auth/login` to 10 per minute per client (429).
- Other services will check a caller by forwarding the Bearer token to
  auth-service `POST /internal/sessions/validate` and applying their own
  role rule.
- Prisma "engine-free" client chosen to avoid downloading engine binaries
  and Alpine/OpenSSL problems. `prisma migrate` still uses the normal CLI.

**Endpoints**
- Public via Kong: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Internal: auth-service `POST /internal/sessions/validate`;
  user-service `GET /internal/users/by-email?email=`, `GET /internal/users/:id`
  (never returns `passwordHash`).
- Swagger UI: http://localhost:3002/docs

**Files added / changed**
- `services/user-service/**` (new), `services/auth-service/**` (new)
- `infra/keycloak/connectsphere-realm.json` (new)
- `infra/docker-compose.yml` (keycloak, user-service, auth-service, healthcheck)
- `infra/postgres/init-databases.sh` (added `auth_db`)
- `gateway/kong/kong.yml` (auth routes, rate limit, `strip_path: false`)
- user-service schema changed from the earlier draft to match the seed:
  added `company`, added `TECHNICAL_SUPPORT_STAFF`, removed `ADMIN`.

**Tested (2026-09-28)** against Postgres 16 loaded with both seed files and a
stand-in for Keycloak's password grant: login (incl. mixed-case email),
`/me`, logout, reuse after logout, seed active/expired/revoked tokens, bad
input, malformed JSON, internal-key checks, `passwordHash` never exposed,
Keycloak-down → 503, `requireRole` 403, lockout path. **Still to verify with
real Keycloak in Docker:** realm import and the lockout timing.

**Known trade-offs**
- The password grant is deprecated in OAuth 2.1. It fits a first-party login
  form; switching to Authorization Code + PKCE is possible later but needs
  frontend redirects.
- Each login leaves a short-lived Keycloak SSO session (expires on its own).
- The realm file contains the dev password and client secret in plain text:
  **dev only.**

**Business rules confirmed by Shadow (2026-09-28)**
- Locked account message: **keep generic** ("Invalid email or password").
- Lockout rule: **5 tries, then wait 1 min rising to 15 min**, auto-unlock.
- Session length: **24 hours, fixed** (changed from the 7-day draft).
- `user_db.users.passwordHash`: **keep it, unused**. Keycloak holds passwords.

**Still open**
- ~~Is Attendee self-registration in scope?~~ → yes, built 2026-10-01 (Attendees only).
- ~~Adding new users~~ → resolved in the later entry (admin API).

**Next up (not started)**: frontend login screen and admin screens using
`usePermissions` / `useAdminApi`; RBAC wiring (validate middleware) in the next service built.
