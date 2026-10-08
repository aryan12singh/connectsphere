# ConnectSphere — development log

A running record of what has been built, the decisions behind it, and what
is still open. **Read this before starting any new feature** so work stays
consistent. Add a new dated entry at the top of "Entries" each time.

## Progress and evidence routine

Following the Sprint 2 Retro, keep this canonical log under `docs/devlogs`.
Every 2–3 days, each owner updates Jira and records: story/AC, delivered
revision/PR, actual test result and evidence link, current blocker, and next
action. The Scrum Master checks stale cards before the next meeting. Record
observed progress; passing automation alone does not establish story acceptance.

Use [the Sprint 2 evidence log](../sprint2/evidence-log.md) for the shared
case-to-result index. Future logs keep the same fields and preserve failed runs.
The Product Owner annotates Figma with approved requirement/AC links, UI edits,
displayed data and source revision; unresolved policy stays in Jira CS-76.
Adoption of this routine is tracked in CS-96.

Entry pattern: `date — owner — CS/AC — revision/PR — delivered behaviour —
test layer/result and evidence — blocker/decision — next action`.

---

## Earlier design notes (historical)

These notes preserve earlier team choices; they are not a new Sprint 3 contract.
Use the current [access matrix](../access-matrix.md), service schemas and
[venue model review](../venue-data-model.md) for running behavior. CS-76/77 owns
Week 7 decisions; the entries below identify the dated implementation stage.

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
- **Security defaults for every service:** `helmet()`, JSON body limit 10kb,
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
- Seed data lives in `services/<name>-service/prisma/seed/NN_<db>.sql`. Load
  order: user_db, auth_db, venue_db, event_db, booking_db, attendance_db,
  messaging_db, notification_db. All seed users' password: `Password123!`.

## Service map (8 October snapshot)

| Service | Database | Status |
|---|---|---|
| user-service | user_db | Built (internal: lookup, list, create, update role/active) |
| auth-service | auth_db | Built (attendee sign-up, login, logout, me, password policy, internal validate, admin API) |
| frontend (Nuxt BFF) | — | Team's app. Auth wired in: live/mock login, /signup page, usePermissions, useAdminApi, admin proxy |
| Keycloak | keycloak_db | Stores its accounts in Postgres (since 2026-10-01) |
| event-service | event_db | Persistent request, draft, decision and activity workflows; CS-11/27/29/44 accepted, other gaps in the evidence log |
| venue-service / booking-service | venue_db / booking_db | Existing venue/calendar/booking implementation; see their story verification |
| attendance / messaging / notification / orchestrator | own db each | Not started |

---

## Entries

### 2026-10-09 — Aryan: bounded Sprint 3 venue/expiry foundation

Base: merged main `46a2bf305c68273149ee60d43cf2d11ef5f95941`. Branch:
`feat/aryan-sprint3-venue-safety`. Five work areas advanced out of the 15 current
Aryan Sprint 3 items; this is a bounded foundation slice, not five completed
stories or a claim of one-third of accepted story points.

| Item | Published behavior/artifact | Remaining work |
| --- | --- | --- |
| [CS-74](https://spmg8.atlassian.net/browse/CS-74) | [Authoritative baseline venue model](../venue-data-model.md): actual migrations/tables, catalogue/hours/history/time handling, fresh HTTP/PostgreSQL checks and explicit gaps | Another developer reviews the artifact; future schema is owned by CS-77. |
| [CS-78](https://spmg8.atlassian.net/browse/CS-78) | [Runnable expiry spike](../hold-expiry.md): real row locks, clock after waiting, leases, version/token fencing, atomic action rollback, restart and catch-up | Planning timebox, policy choices, independent review and production CS-37/90 integration. |
| [CS-85](https://spmg8.atlassian.net/browse/CS-85) | Pure occupied-window/overlap functions with explicit buffers/touching policy and strict instant validation | CS-84/77 configuration/data contract; actual search/calendar/suitability/write consumers, including CS-39 atomic enforcement. Original API/browser cases remain Not Executed. |
| [CS-76](https://spmg8.atlassian.net/browse/CS-76) | [Venue/operations decision register](../venue-policy-decisions.md), with inclusive/strict hold cap and draft defaults clearly Pending | Customer answers and recorded PO/team choices; this subset does not complete release-wide reconciliation. |
| [CS-96](https://spmg8.atlassian.net/browse/CS-96) | Canonical DEVLOG at the agreed path; original history preserved; dated Sprint 2 evidence index linked | Figma annotations, actual async cadence and team adoption remain open. No meeting outcome is invented. |

Verification: **tested code [c73a4aa](https://github.com/aryan12singh/connectsphere/commit/c73a4aaf49810721dc35ba83ea048413658f9f3a), tree `9f825861fdaabae24dc64d44b1fecdbabcaf65c3`. **436/436 local checks passed**: frontend 182 (includes the 52 new domain checks), Event 132, Venue 46, Booking 41, HTTP contracts 25 and PostgreSQL expiry spike 10. Frontend/application and E2E typechecks plus production build passed. Frontend measured statement/branch/function/line coverage: 70.13%/65.67%/66.76%/73.93%; no new coverage threshold is invented. [Final CS-78 composite](../../tests/records/CS-78/test-runs/2026-10-08T16-49-25Z-GREEN-SPIKE.md), [CS-85 domain record](../../tests/records/CS-85/test-runs/2026-10-08T16-49-25Z-GREEN.md) and the other story regressions retain the actual layer and date**. Node 22.23.3 and a fresh
PostgreSQL 16 fixture with migrated `venue_test`, `booking_test`, `event_test`.
The initial sub-millisecond acceptance defect was reproduced (two failures) and
fixed before the final rerun. These are domain/API/database checks with explicit
fixtures; no new Sprint 3 browser feature or production notification delivery
is claimed. Raw logs/JSON/coverage stay outside Git or in CI artifacts; failed
and successful Markdown runs follow `tests/records`.

Jira readback on 9 October: Sprint 3 is **active**, 34 assigned items, with 15
under Aryan. Earlier pre-start descriptions below are dated history and are
superseded by this readback. CS-96 is In Progress; the other 14 owned cards are
To Do. This checkpoint publishes work only and does not transition Jira cards.

| Unfinished owned item | Current prerequisite/action |
| --- | --- |
| CS-84, CS-87 | Javier's CS-77 shared data/access/API contract. |
| CS-36 | CS-87 and current assignment work CS-30; CS-33 baseline is already Done. |
| CS-39 | Reviewed CS-85 window integration and CS-78 timing contract; real atomic writes still required. |
| CS-37 | CS-36/39/77/78/87; decide hold metadata/default/extension/cap, then build the complete request/hold UI/API. |
| CS-38 | CS-37/39, then staff approval/rejection and current-assignment checks. |
| CS-86 | Marc's CS-50 notification producer contract plus reviewed buffer model/policy. |
| CS-93 | CS-38 and Alan's CS-42 technical readiness. |
| CS-94, CS-95 | CS-93 then CS-94; reviewed Safety transitions and reason/invalidation decisions. |

Next: agree the pending decisions and CS-77 contract, then integrate CS-84/87,
CS-85/39 and CS-36/37/38 in dependency order. Safety follows venue and technical
readiness. Keep the spike's scratch schema out of production migrations. Rebase
this branch on reviewed peer/main changes before later integration. Existing
browser evidence labels were normalized without changing results or timestamps.

### 2026-10-08 — Sprint 2 evidence and Week 7 backlog reconciliation

Verified merged main `46a2bf3` with 411 fresh automated checks, 11 built full-stack smoke checks and one same-ID restart check without reseeding. Main CI run 37605379263 separately records eight green jobs and 46 desktop/mobile browser cases on that revision. The [evidence log](../sprint2/evidence-log.md) links all 13 story comments, the consolidated Jira-table evidence document, 177 named UI/test/SQL/CI images, raw records and the reusable ten-day Scrum meeting template in CS-96. Large files and JSON stay outside the source tree; dated Markdown execution records retain the actual layer/date.

The evidence keeps CS-30 reassignment incomplete and distinguishes CS-28's working Planning rejection API from its missing UI action. CS-32 later lifecycle remains future integrated work. Aryan's CS-11/27/29/44 preserve the earlier explicit manual/PO/reviewer acceptance; no peer story is closed by automated evidence. Current five-role policy is the Sprint 2 baseline; the new Lead/Safety roles and policies are future Week 7 work.

Imported 199 revised PM cases to the actual Jira story owners, retaining the earlier 111 cases and six pending CS-30 retirement proposals. All 310 active prospective IDs are Not Executed. Corrected stale Planning/signup/tie-break/confirmation/history test-table wording by scenario. Front-loaded CS-93/94/95/31/47/51 into future Sprint 3: 102 proposed points/23 stories plus five tasks versus Sprint 4's 52 points/11 stories plus three tasks. Team capacity, owners, final commitment, 20 unanswered customer clarifications, coverage policy and Figma/adoption decisions remain explicit in CS-76/77/79/96. This entry is evidence preparation, not fabricated meeting outcomes.

### 2026-10-07 — integrated Sprint 2 identity, calendar and CI repairs

Aryan branch follow-up addresses Marc CS-10/CS-26 and Alan CS-33/CS-34: five functional role homes, sealed multi-role selection, fresh permission unions, exact idle expiry, Organiser/Attendee field-guided signup, transactional/concurrent organisation resolution, seed-only staff provisioning, ordered operating hours and venue-local day/week boundaries. Booking decisions require the decision grant even for multi-role staff. Coordinator booking create/read/edit/list/history verifies current Event assignment through Event service; stale assignment denies403, outage fails503 without writes. An additive migration permits Technical Support venue reads only. Live verification also found an early native form GET before Vue hydration. Request/login/signup/venue inputs/actions and calendar/workspace controls now stay disabled until handlers mount, with actual SSR regressions and no-JavaScript browser checks. Each service retains its own database; static role policy is bundled separately in the images. No Week7 scope was added.

Frontend 130/130 and all application CI jobs passed; live desktop/mobile 46/46 passed. A transient restart-login 404 led to a one-second Kong DNS cache with stale reuse disabled and two consecutive gateway/BFF readiness samples. Two subsequent retained-ID restart cycles passed without reseeding. The [delivery record](../sprint2/event-request-delivery.md) links CI and the remaining acceptance gates.

CI now typechecks browser specs and runs dedicated Auth/User unit and PostgreSQL HTTP suites, PostgreSQL Venue/Booking API suites, source coverage for all five services and frontend V8 coverage. Explicit Bash defaults restore pipefail for tests piped through tee. A deliberately failing PR run verified that Auth/User/Venue failures reject CI. Automated evidence does not replace independent manual review, explanation, merge-commit CI or PO acceptance.


### 2026-10-07 — Persistent Sprint 2 event workflows and CI

CS-11/27/29/44 now use the existing forms, shared event schema/guard and persistent PostgreSQL workflows. Drafts remain private; return/amend/resubmit retains the request ID and Coordinator; actual Event history has a distinct ID. Trusted effective permissions, version locks and durable replay protect transactional assignment, activity and notification outbox writes. Delivery/relay and later transitions remain separate work.

Application source passed frontend 111, Event 131, Venue 52, Booking 48, production desktop/mobile browser 22, live API 11 and no-reseed restart 1 in [run 37524638714](https://github.com/aryan12singh/connectsphere/actions/runs/37524638714). Earlier meaningful RED cases drove parser limits/privacy, permission revocation, date round trips, staff booking permissions, hydration and startup/rate-limit repairs. Selected dated story records and CI artifacts preserve execution evidence.

[Delivery and review gates](../sprint2/event-request-delivery.md), [workflow/ERD](../event-workflows.md), [decisions](../event-workflow-decisions.md) and [clean-stack commands](../event-review-run.md) consolidate the branch documentation. Raw audit JSON and repeated diagnostic reports are archived outside the source tree and recoverable from Git history. The development log retains the team's dated-entry convention.

CI now separates the frontend and five implemented services, with a real authentication/browser/restart job and an aggregate failure-aware gate. Auth/User still need dedicated unit suites. The current CI revision must obtain its own green PR checks; another developer's review/manual verification, Aryan's code understanding, green main CI and PO acceptance remain required before Done. Week 7 changes stay future planning scope; instructor access is deferred to the final stage. Compatible dependency patches reduced the previous source audit from 29 to 23 inherited findings, which still need release review.

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
