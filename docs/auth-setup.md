# Auth setup — login, RBAC and the tech support admin API

What this adds:

- **auth-service**: login, logout and "who am I", permission checks, and the
  admin API (users, role permissions, settings, audit log).
- **user-service**: user profiles and roles.
- **Keycloak**: checks passwords and locks accounts after repeated wrong passwords.
- **Kong**: sits in front of everything.
- **Nuxt frontend wiring** (in `frontend/`): the BFF login and logout talk to
  auth-service, a `usePermissions()` composable, a page permission check, and
  an admin API proxy with a `useAdminApi()` composable.

```
Browser ──► Nuxt BFF /api/* ──► Kong :8000 ──► auth-service ──► Keycloak   (password check, lockout, admin API)
                                 │
                                 ├──► user-service ──► user_db  (profile, role, active?)
                                 └──► auth_db  (sessions, role permissions, settings, audit log)
```

## 1. Copy the files into your repo

Unzip and copy each folder onto the same path in your repo:

| From the zip | Into your repo | Action |
|---|---|---|
| `services/user-service/` | `services/user-service/` | Replace |
| `services/auth-service/` | `services/auth-service/` | Replace (or new) |
| `infra/keycloak/` | `infra/keycloak/` | Replace (adds auth-service's admin service account) |
| `infra/docker-compose.yml` | same | Replace (final merged version) |
| `infra/postgres/init-databases.sh` | same | Replace (adds `auth_db`) |
| `gateway/kong/kong.yml` | same | Replace (final merged version) |
| `frontend/` (14 files) | `frontend/` — same paths | 8 new + 6 replaced. See section 7 for the list |
| `docs/dev-log.md`, `docs/auth-setup.md` | `docs/` | Replace |

Nothing in this setup uses your `backend/` folder. If it still holds code
from the old monolith draft, clear it out so nobody builds on it.

Check that `.gitignore` contains `node_modules/` and `.env`.

## 2. Start the stack

From the repo root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Each service runs `prisma migrate deploy` on start-up, which applies any new
migrations. The auth migration also inserts the default settings and the
default permissions for every role.

**If you ran an earlier version of this stack**, do this once:

```bash
# Keycloak only imports the realm file when the realm doesn't exist yet.
# Recreate the container so it picks up the new service account.
docker compose -f infra/docker-compose.yml rm -sf keycloak
docker compose -f infra/docker-compose.yml up -d keycloak

# Only if your Postgres volume predates auth_db:
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -c "CREATE DATABASE auth_db;"
docker compose -f infra/docker-compose.yml restart auth-service
```

Services without code yet (event, venue, booking, attendance, messaging,
notification, orchestrator) are defined in the compose file under the
`not-built-yet` profile, so a normal `up` skips them. When one gets code:

1. Delete its `profiles:` line.
2. Add it to Kong's `depends_on`.

## 3. Load the seed data

Wait until both services log "listening", then run these from the repo root:

```bash
docker compose -f infra/docker-compose.yml exec -T postgres psql -U connectsphere -d user_db < services/user-service/prisma/seed/01_user_db.sql
docker compose -f infra/docker-compose.yml exec -T postgres psql -U connectsphere -d auth_db < services/auth-service/prisma/seed/02_auth_db.sql
```

Or open the files in pgAdmin4 (http://localhost:5050) → Query Tool → run.
Both are safe to run twice.

## 4. Try it

All seed users share the password `Password123!`. Tech support accounts are
`hafiz.ismail@connectsphere.sg` and `chloe.ng@connectsphere.sg`.

```bash
# Log in as tech support (through Kong)
curl -X POST http://localhost:8000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"hafiz.ismail@connectsphere.sg","password":"Password123!"}'
# -> { "token": "...", "user": {...}, "permissions": ["audit.view", "permissions.manage", ...] }

TOKEN=<paste token>

curl http://localhost:8000/admin/users -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/admin/permissions -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/admin/settings -H "Authorization: Bearer $TOKEN"

# Change the session length to 12 hours
curl -X PUT http://localhost:8000/admin/settings -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"sessionTtlHours":12}'
```

The full API, with a "Try it out" button, is in Swagger UI at
http://localhost:3002/docs. The Keycloak admin console is at
http://localhost:8080 (admin / admin).

## 5. What tech support can change

| Area | What | Takes effect |
|---|---|---|
| Users | Create (with an initial password), change role, disable / re-enable | Immediately. Disabling also ends the user's open sessions |
| Role permissions | Tick which permissions each of the 5 roles has | On each user's next request |
| Settings | Session length | For logins made after the change |
| Settings | Idle timeout (0 = off) | Immediately, for every session |
| Settings | Lockout: tries, first wait, longest wait | Immediately (copied to Keycloak) |
| Settings | Password rules: min length, upper/lower/digit/special | New passwords (copied to Keycloak) |

Built-in safety rules:

- Tech support can't change their own role or disable themselves.
- Tech support always keeps `users.manage` and `permissions.manage`, so the
  admin screens can never lock everyone out.
- Every change is written to the audit log.

## 6. Protecting routes (RBAC) — the rule for every developer

Routes check a **permission**, never a role name. The permission list is
in `services/auth-service/src/lib/permissions.js`.

```js
const { requireAuth } = require('./middleware/requireAuth');
const { requirePermission } = require('./middleware/requirePermission');

router.post('/event-requests/:id/decision',
  requireAuth,
  requirePermission('event_requests.review'),
  handler);
```

**Adding a new permission:**

1. Add it to `lib/permissions.js`, with a short description.
2. Use it in `requirePermission(...)`.
3. Grant it to the right roles with a migration that inserts into
   `role_permissions` (or through the admin API).

A misspelt permission name crashes the service at start-up on purpose, so
it can't silently block everyone.

**In another service** (e.g. event-service): forward the caller's token to
`POST http://auth-service:3000/internal/sessions/validate` with the
`x-internal-api-key` header. You get back `{ valid, user, permissions }`.
Then check `permissions.includes('...')`. This will be packaged as a
copyable middleware when the first such service is built.

## 7. Frontend (Nuxt)

Your frontend is Nuxt with a server-side layer (BFF): the browser only
calls Nuxt's own `/api/*` routes, and `nuxt-auth-utils` keeps the login in
an encrypted, httpOnly cookie. The backend session token is stored in the
session's `secure` part, which never reaches the browser. The Nuxt server
calls Kong on the browser's behalf, so the browser never talks to Kong.

**Files (copy onto the same paths in `frontend/`):**

| File | New / replaced | What it does |
|---|---|---|
| `nuxt.config.ts` | replaced | Adds `runtimeConfig`: `apiBaseUrl` (Kong) and `authMode` (`mock` / `live`) |
| `.env.example` | new | `NUXT_AUTH_MODE`, `NUXT_API_BASE_URL`, `NUXT_SESSION_PASSWORD` |
| `server/utils/backend.ts` | new | `backendFetch()`: calls Kong, adds the token, clears the cookie on a backend 401 |
| `server/utils/mockPermissions.ts` | new | Default permissions per role, for mock mode |
| `server/api/auth.post.ts` | replaced | Login: real auth-service in live mode, mock users in mock mode. Token goes in `secure` |
| `server/api/auth.delete.ts` | replaced | Logout: also ends the backend session in live mode |
| `server/api/auth/me.get.ts` | new | Checks the backend session and refreshes role + permissions |
| `server/api/admin/[...path].ts` | new | Proxies `/api/admin/*` to auth-service `/admin/*` (live mode only) |
| `app/types/session.d.ts` | replaced | Adds `permissions` to the user and `token` to the server-only session |
| `app/types/page-meta.d.ts` | new | Allows `definePageMeta({ permission: '...' })` |
| `app/middleware/auth.global.ts` | replaced | Adds the page permission check. Your login check and role gate are unchanged |
| `app/plugins/verify-session.client.ts` | new | Once per page load, confirms the backend session is still alive; logs out if not |
| `app/composables/usePermissions.ts` | new | `can('users.manage')`, `canAny(...)` |
| `app/composables/useAdminApi.ts` | new | Typed calls for the admin screens |

**Modes** (set in `frontend/.env`):

- `NUXT_AUTH_MODE=mock` (default). Behaves exactly as before: mock users
  such as `organiser@example.com`, the event mocks, and your existing tests.
  No backend needed. The admin API returns 501 in this mode.
- `NUXT_AUTH_MODE=live`. Real login with the seed users (e.g.
  `sarah.tan@nexuslabs.sg` / `Password123!`). Needs the Docker stack and
  `NUXT_API_BASE_URL=http://localhost:8000`.

  Note: the event pages still use mock data keyed to mock user IDs, so real
  users see no seeded events until event-service exists.

**Your tests:** with these files your `tests/specs` give the same result as
before (75 pass, and the same 20 CS-11/CS-30 failures that exist without
them). No test needed changing.

**Using it in components and pages** (both composables are auto-imported by Nuxt):

```vue
<script setup lang="ts">
const { can } = usePermissions()
const admin = useAdminApi()
const { users } = await admin.listUsers({ search: 'tan' })
</script>

<template>
  <Button v-if="can('users.manage')">Add user</Button>
</template>
```

```ts
// A page only some roles may open (e.g. app/pages/admin/users.vue)
definePageMeta({ permission: 'users.view' })
```

Hiding a button or page only keeps the screen tidy. The backend checks the
permission on every call.

Your middleware's role gate still only lets organisers and coordinators
into pages **without** a `permission`. Tech support can open pages that
declare an admin permission, but is sent to /login from `/`. Decide what
tech support's home page should be when the admin screens are built.

## 8. Running a service without Docker (optional)

```bash
cd services/auth-service
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

## 9. Changing a schema later

Edit `prisma/schema.prisma` in **that service only**, then run:

```bash
npx prisma migrate dev --name describe_the_change
```

Commit the new folder under `prisma/migrations/`. Never change tables by
hand in pgAdmin4.

Timestamps are stored in **UTC**. If you edit or compare times by hand in
pgAdmin4, use `now() at time zone 'utc'`, not `now()`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login returns 503 | Keycloak is still starting (around 30 s), or the client secret doesn't match the realm file |
| Admin create/disable or saving settings returns 503 | Keycloak is down, or the realm predates the service account. Recreate the Keycloak container (step 2) |
| auth-service logs "Keycloak sync attempt N failed" | Same as above. It retries for about 2 minutes, then gives up until the next settings save |
| Login 401 with the right password | Account locked (wait), account disabled by tech support, or the user isn't in Keycloak |
| Login 429 | More than 10 login attempts in a minute from your machine (Kong) |
| Nuxt login returns 503 in live mode | Kong or auth-service isn't running, or `NUXT_API_BASE_URL` is wrong |
| Admin calls return 501 | Frontend is in mock mode: set `NUXT_AUTH_MODE=live` |
| Create user: "Password does not meet the password rules" | Check the current rules in `GET /admin/settings` |
| `prisma generate` fails downloading engines | Your network blocks `binaries.prisma.sh`. Try another network |
