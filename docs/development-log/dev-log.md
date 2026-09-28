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
- **Security defaults for every service:** `helmet()`, JSON body limit 10kb,
  generic error messages (details only in logs), `/internal/*` routes guarded
  by the `x-internal-api-key` header and never routed by Kong.
- **RBAC is permission-based.** Five fixed roles (`EVENT_ORGANISER`,
  `EVENT_COORDINATOR`, `VENUE_STAFF`, `TECHNICAL_SUPPORT_STAFF`, `ATTENDEE`,
  stored in user-service). Routes check a **permission**, never a role name:
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

## Service map (current)

| Service | Database | Status |
|---|---|---|
| user-service | user_db | Built (internal: lookup, list, create, update role/active) |
| auth-service | auth_db | Built (login, logout, me, internal validate, admin API) |
| frontend (Nuxt BFF) | — | Team's app. Auth wired in: live/mock login, usePermissions, useAdminApi, admin proxy |
| event / venue / booking / attendance / messaging / notification / orchestrator | own db each | Not started |

---

## Entries

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
- Is Attendee self-registration in scope? (Not built. Accounts come from
  the seed and Keycloak realm only.)
- ~~Adding new users~~ → resolved in the later entry (admin API).

**Next up (not started)**: frontend login screen and admin screens using
`usePermissions` / `useAdminApi`; RBAC wiring (validate middleware) in the next service built.
