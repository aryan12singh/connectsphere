# How to run ConnectSphere and test it by hand

Everything you need to start the system from a clean clone and check, step
by step, that it behaves as intended. The numbered **MT** checks double as
the documented manual test cases required by the Definition of Done (item 2).

Commands work in **PowerShell** (Windows) and in bash/zsh (macOS/Linux)
unless a step says otherwise. Run them from the repo root (the folder with
`README.md`) unless the step says `cd` somewhere.

For the event request workflow (CS-11/29/27/44 onwards), use the
[isolated review recipe](event-review-run.md) first. It supplies a fresh
PostgreSQL 16 project, Node 22 locked installs, parameterised ports, actual
live-auth smoke and a restart check. The general development instructions and
Sprint 1 manual checks below are retained for their original context; their
old event expectations and test counts do not describe the current branch.
The full frontend regression suite imports the real venue-service validator;
the isolated recipe therefore installs its locked runtime dependencies as
well as the event-service and frontend dependencies.

---

## Part A — One-time setup

You need:

- **Docker Desktop**, running.
- **Node.js 22** (`node -v`), the verified runtime for this branch's locked dependencies.
- **Git**. Clone the repo normally. `.gitattributes` keeps the shell script's
  line endings correct on Windows.

### A2. Legacy general-development reset (skip for isolated review)

The destructive reset below belongs to the older general-development setup.
It is unnecessary for the isolated recipe and must not be used on an existing
shared development project while verifying these workflows.

If you have run the stack before and want a clean start (or something is in
a confusing state), wipe the old containers and **all** data first. This
deletes every database, including Keycloak's accounts and anyone who signed up:

```powershell
docker compose -f infra/docker-compose.yml down -v
```

Then check `frontend/.env`, if it exists: there must be **no** line
`NUXT_SESSION_PASSWORD=` with nothing after it (delete it if there is).
Continue with Part B; you will redo B2 (seed data) and Part C.

---

## Part B — Start the backend

### B1. Start the containers

```powershell
docker compose -f infra/docker-compose.yml up --build -d
```

The first build takes a few minutes. Check that everything is up:

```powershell
docker compose -f infra/docker-compose.yml ps
```

You should see `postgres`, `pgadmin`, `rabbitmq`, `keycloak`, `kong`,
`user-service`, `auth-service`, `event-service`, `venue-service`,
`booking-service`, `equipment-service`, `attendance-service` and
`notification-service` running. The one-off `seed` container loads the seed
data and then exits.

Keycloak takes about 30–60 seconds to be ready. Until then, logins return
"temporarily unavailable".

To watch the authentication, venue and booking services start:

```powershell
docker compose -f infra/docker-compose.yml logs -f auth-service user-service venue-service booking-service
```

Wait for `auth-service listening on port 3000` and
`Keycloak lockout and password rules synced from auth_db`, then press Ctrl+C.

### B2. Load the seed data (once)

The user and auth tables are created by their migrations when the services
start. Then load the seed rows. `docker compose cp` works in both PowerShell
and bash (PowerShell has no `<` redirect):
Keycloak keeps its accounts in Postgres (`keycloak_db`), so accounts made by
sign-up or by tech support survive `down`/`up` and rebuilds. It imports
`infra/keycloak/connectsphere-realm.json` only when `keycloak_db` is empty.

**Upgrading from an older version of this repo (before 2026-10-01)?** Your
Postgres volume has no `keycloak_db` yet (the init script only runs on an empty
volume), and Keycloak will keep restarting. Either wipe everything with
`down -v` and redo B2, or keep your data and create it once:

```powershell
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d postgres -c "CREATE DATABASE keycloak_db"
docker compose -f infra/docker-compose.yml restart keycloak
```

To watch the two services start:

```powershell
docker compose -f infra/docker-compose.yml logs -f auth-service user-service
```

Wait for `auth-service listening on port 3000` (3000 is its port inside the
container; you reach it on 3002) and
`Keycloak lockout and password rules synced from auth_db`, then press Ctrl+C.
The second line can take a minute while Keycloak starts.

**Then restart Kong. Do this after every `up --build`.** Kong keeps sending
requests to the old containers, and logins fail with a 502 until you do:

```powershell
docker compose -f infra/docker-compose.yml restart kong
```

The tables are created automatically when the services start. The one-shot
Compose seed loader reads the canonical per-service SQL files:

```powershell
docker compose -f infra/docker-compose.yml run --rm seed
```

Running the loader again is safe. It waits for each service database to be
migrated, then loads the canonical seed under that service's `prisma/seed/`
directory, including the Attendance Event projection.

All services persist to their own databases.

The remaining databases are reserved for services still marked
`not-built-yet` in the compose file.

### B3. Postman collections

Import the collection for the service you want to exercise:

- `services/booking-service/postman/booking-service.postman_collection.json` — logs in through Kong, then covers booking creation, idempotent retry, retrieval, cancellation, history and availability.
- `services/venue-service/postman/venue-service.postman_collection.json` — logs in through Kong as an Event Coordinator and Venue Staff, then covers venue options, listing, CRUD, operating-hours replacement, history and empty-hours validation.

The booking collection defaults to the seeded coordinator and venue. Event
requests have no Postman collection; use event-service's
[OpenAPI file](../../services/event-service/docs/openapi.yaml) or the website.

### B4. Useful addresses

| What | Address | Login |
|---|---|---|
| Swagger UI (auth-service API) | http://localhost:3002/docs | — |
| Keycloak admin console | http://localhost:8080 | admin / admin |
| pgAdmin4 | http://localhost:5050 | admin@connectsphere.dev / admin |
| RabbitMQ console | http://localhost:15672 | `connectsphere` / `connectsphere-dev-only` (local development only) |
| Kong (the API the frontend uses) | http://localhost:8000 | — |

To connect pgAdmin4 to the database: Add New Server → Connection tab → host
`postgres`, port `5432`, user `connectsphere`, password `connectsphere`.

---

## Part C — Start the website

```powershell
cd frontend
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
```

Open `frontend/.env` and choose a mode:

- `NUXT_AUTH_MODE=live` (the default). Real login through the backend from Part B, with
  the seed users (list below). Event requests, drafts and history use event-service and PostgreSQL. Role homes and grants are described in [the access matrix](../architecture/access-matrix.md).
- `NUXT_AUTH_MODE=mock` is a synthetic sign-in fixture for automated tests only.
  It has no event data: every event page needs the real services from Part B.

Leave `NUXT_API_BASE_URL=http://localhost:8000`. Leave the
`NUXT_SESSION_PASSWORD` line commented out. Nuxt generates one on first
start. An **empty** value (`NUXT_SESSION_PASSWORD=`) breaks login with
"Empty password".

```powershell
npm run dev
```

Open http://localhost:3000. The first load of each page takes a few seconds
while Nuxt compiles it.

### Seed users (live mode)

Each seed user has their own password. The full list is in the row comments of
`services/user-service/prisma/seed/01_user_db.sql`. The ones used in the test cases:

| Role | Email | Password |
|---|---|---|
| Event Organiser | sarah.tan@nexuslabs.sg | `Sarah@CS01!` |
| Event Organiser | daniel.lim@brightpath.edu.sg | `Daniel@CS02!` |
| Event Coordinator | aisha.rahman@connectsphere.sg | `Aisha@CS05!` |
| Event Coordinator | kevin.ong@connectsphere.sg | `Kevin@CS06!` |
| Event Coordinator Lead | jordan.lim@connectsphere.sg | `Jordan@CS32!` |
| Venue Staff | ravi.kumar@marinaconvention.sg | `Ravi@CS08!` |
| Safety Officer | alex.chen@connectsphere.sg | `Alex@CS31!` |
| Technical Support | hafiz.ismail@connectsphere.sg | `Hafiz@CS11!` |
| Technical Support | chloe.ng@connectsphere.sg | `Chloe@CS12!` |
| Attendee | ethan.goh@gmail.com | `Ethan@CS13!` |

Mock mode users (`organiser@example.com` and so on) still use `Password123!`.

Passwords are checked by **Keycloak**, which gets them from
`infra/keycloak/connectsphere-realm.json`. The `passwordHash` column in
`user_db` is not used for login. If you change a seed password, change it in
the realm file too, then reset `keycloak_db` (Part E).

---

## Part D — Manual test cases

Run these in **live mode** unless stated. Tick each one; if a result
differs, note what you saw.

### Login and logout (website)

| # | Steps | Expected |
|---|---|---|
| MT-01 | On /login, enter `sarah.tan@nexuslabs.sg` with a wrong password (her real one is `Sarah@CS01!`) | "Invalid credentials". Same message for an unknown email (try `nobody@x.com`) |
| MT-02 | Log in as `sarah.tan@nexuslabs.sg` | Lands on **Your events** (empty list in live mode) |
| MT-03 | Click the initials (top right), then **Sign out** | Shows Sarah Tan, `EVENT_ORGANISER`, her email. Sign out returns to /login. In pgAdmin, `auth_db.sessions`: her newest session now has `revokedAt` set |
| MT-04 | Log in as `aisha.rahman@connectsphere.sg` | Lands on **Review queue** |
| MT-05 | Log in as `hafiz.ismail@connectsphere.sg` (also try Venue Staff and Attendee) | Opens Technical Support `/technical-requirements`, Venue Staff `/venue`, or Attendee `/attendances` |
| MT-06 | Signed out, go to http://localhost:3000/ | Redirected to /login |
| MT-07 | Log in as Aisha, then refresh the page | Still logged in |

### Attendee sign-up (website)

| # | Steps | Expected |
|---|---|---|
| MT-27 | On /login click **Create an account** | Opens /signup. Works while logged out |
| MT-28 | Click **Create account** with the form empty | Each empty field says what is missing; nothing is sent |
| MT-29 | Type a password slowly, e.g. `abc` → `Abcdefg1!` | The rules under the field tick (✓) one by one. A different confirm password gives "The passwords do not match." |
| MT-30 | Sign up as `test.attendee@example.com`, any names, password `Str0ng!Pass` | Goes to /login with "Account created. Please sign in." In pgAdmin: `user_db.users` has the row with role **ATTENDEE**; `auth_db.audit_logs` has a `USER_REGISTERED` entry |
| MT-31 | Sign up again with the same email, then with `sarah.tan@nexuslabs.sg` | "A user with this email already exists" both times |
| MT-32 | Log in as `test.attendee@example.com` / `Str0ng!Pass` | Opens Attendee home and its own profile |
| MT-33 | In Swagger (3002), `POST /auth/register` with `"role": "TECHNICAL_SUPPORT_STAFF"` in the body | 400 with role guidance; no account created |
| MT-34 | Open http://localhost:8000/auth/password-policy, then /signup | The rules match the seeded `auth_db.auth_settings` row (minimum 8 characters, upper, lower, digit, special) |
| MT-35 | `docker compose -f infra/docker-compose.yml restart keycloak`, wait a minute, log in as `test.attendee@example.com` | Still works: Keycloak kept the account in Postgres |

### Security rules (website)

| # | Steps | Expected |
|---|---|---|
| MT-08 | Enter a wrong password for `kevin.ong@connectsphere.sg` **5 times**, then the right one | Still "Invalid credentials": the account is locked. After about 1 minute the right password works. (More than 10 attempts a minute from your machine gives a "too many requests" error from Kong. That's the separate rate limit.) |
| MT-09 | In browser dev tools → Application → Cookies, look at the session cookie | Marked **HttpOnly**. Local/session storage contains no token |

### Controlled account setup (Swagger UI, internal key)

There is no in-app user, permission or settings administration (CS-10, CS-24 T02, CS-76). Technical Support's website home is the equipment review queue at `/technical-requirements`, with Manage equipment stock and Failed notifications tabs. Staff accounts and role permissions are seeded. Disabling or re-enabling an account is an operator command on auth-service, protected by the internal key.

Open http://localhost:3002/docs and check that the server dropdown shows `http://localhost:3002`. For the Internal routes, click **Authorize**, and under `internalApiKey` enter the `INTERNAL_API_KEY` value from compose (`change-me-dev-internal-key` locally).

| # | Steps | Expected |
|---|---|---|
| MT-10 | Log in on the website as Hafiz (Technical Support) | Tabs: Review technical requests, Manage equipment stock, Failed notifications. No user, permission or settings screen |
| MT-11 | Log in via Swagger `POST /auth/login` as Hafiz, then call `http://localhost:8000/admin/users` with his token (or open `/api/admin/users` in the logged-in browser) | **404**: the admin API no longer exists |
| MT-12 | Sign up `test.attendee@example.com` (MT-30). In pgAdmin, copy its `user_db.users.id`. In Swagger, `PATCH /internal/users/{id}/status` with `{ "isActive": false }`, then refresh the browser where it is logged in | 200. Logged out; logging in again says "Invalid credentials". `auth_db.audit_logs` has `USER_DISABLED` by `controlled-setup` |
| MT-13 | Same with `{ "isActive": true }`, then log in | 200. Login works again |
| MT-14 | As Jordan (Lead), assign a submitted request to Aisha. Then `PATCH /internal/users/a1000000-0000-4000-8000-000000000005/status` (Aisha) with `{ "isActive": false }` | **409** `COORDINATOR_HAS_OPEN_EVENTS`, listing her open requests. Aisha can still log in |
| MT-15 | Call the same route without the internal key | **403** |

### Database (pgAdmin4)

| # | Steps | Expected |
|---|---|---|
| MT-24 | Open `auth_db` → `sessions` | `tokenHash` holds 64-character hashes, never the token itself |
| MT-25 | Open `auth_db` → `role_permissions`, `audit_logs` | `role_permissions` holds the seeded grants only (Technical Support has `notifications.failures.view`, not `users.*`); `audit_logs` has the sign-up and status entries from MT-12 to MT-14 |

### Automated tests

| # | Steps | Expected |
|---|---|---|
| MT-26 (historical Sprint 1 result) | `cd frontend` then `npm test` | At that snapshot: **82 passed, 20 failed** (including 7 sign-up passes). The obsolete CS-11 route harness and CS-30 expectation were later replaced with mapped persistent-workflow assertions. For the current branch run `npm run test:report` with the isolated PostgreSQL/fixture-auth environment in [event-review-run.md](event-review-run.md); assess the actual dated result rather than this historical count. |

---

## Part E — Stop, reset, troubleshoot

```powershell
docker compose -f infra/docker-compose.yml down        # stop, keep data
docker compose -f infra/docker-compose.yml down -v     # stop and WIPE all data (then redo B2)
```

After `down -v`, Keycloak also starts fresh from `infra/keycloak/connectsphere-realm.json`,
and every signed-up account is gone (redo B2 for the seed users).

| Symptom | Fix |
|---|---|
| Website login fails; dev tools show **502** from Kong | Kong still points at an old container after a rebuild: `docker compose -f infra/docker-compose.yml restart kong` |
| Seed user login fails but mock works | Seed users each have their own password now (Part C table), not `Password123!`. Keycloak must have the current realm file. It only imports it into an empty `keycloak_db`, so after the realm file changes, either `down -v` (wipes everything), or reset just Keycloak: `docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d postgres -c "DROP DATABASE keycloak_db WITH (FORCE)" -c "CREATE DATABASE keycloak_db"` then `restart keycloak`. That also deletes the logins of signed-up users (their `user_db` rows stay, but they can no longer log in) |
| Keycloak keeps restarting; its log says `database "keycloak_db" does not exist` | Your Postgres volume is older than this change. See the "Upgrading" note in Part B1 |
| Sign-up says "Sign-up needs NUXT_AUTH_MODE=live" | Sign-up creates real accounts, so it only works in live mode |
| Sign-up says "Too many sign-up attempts" | Kong allows 5 sign-ups a minute (site-wide when going through the website). Wait a minute |
| Website login says "The ConnectSphere service is unavailable" | Backend not running, or Keycloak still starting. Check Part B1 |
| "Invalid credentials" for a seed user in live mode | Did B2 run? Is the account locked (MT-08)? Is `NUXT_AUTH_MODE=live`? |
| Swagger "Try it out" fails with a network/CORS error | Pick `http://localhost:3002` in the server dropdown |
| `auth-service` exits with "Missing required environment variable" | Compose file edited? Compare with the repo version |
| Postgres logs `$'\r': command not found` | `init-databases.sh` has Windows line endings. Run `git add --renormalize .` and re-clone, or convert the file to LF, then `down -v` and `up` |
| Every login fails; browser dev tools show 500 "Empty password" | `frontend/.env` has `NUXT_SESSION_PASSWORD=` with nothing after it. Delete that line (or give it 32+ characters) and restart `npm run dev` |

## Persistent CS-11/29/27/44 branch

Follow [the isolated review recipe](event-review-run.md) for real-database/API/live-auth/browser checks. It uses Node22, PostgreSQL16, a unique project/volume, loopback ports and locked installs. Existing destructive reset commands in older instructions are **not** required for this implementation verification. The active event BFF has no mock fallback; registration capture, same-record drafts/resubmissions and authorised history are described in [event workflows](../architecture/event-workflows.md).


## Sprint 3 integrated Venue, Safety and notifications — 17 October 2026

The normal Compose stack now starts Equipment and Notification with their own migrated databases and RabbitMQ. [Integration/handoff](../sprints/sprint3/integration-handoff.md) contains the exchange/queue/bindings, durable outbox/receipt semantics, complete isolated verification command and non-destructive existing-volume upgrade procedure. Follow that procedure when a realm predates the Officer fixture; restarting Keycloak alone does not import a missing user into an existing realm.

The current assigned Coordinator opens the Planning Event to request independent rooms and provide technical requirements. Venue Staff review `/venue`; Technical Support uses `/technical-requirements` to review actual inventory, approve and reserve. Approved NOT_REQUIRED is explicit. The Coordinator can send complete current proof for Safety; the Officer uses `/safety-checks`. Record a seven-factor decision, review/correct affected facts through the Coordinator, and create a new round. After current approval, the Coordinator separately confirms and starts Preparation. Venue/Technical staff use `/technical-requirements/preparation` to record current-round updates. No actor acquires Officer access through public signup.

All fixture passwords are local synthetic examples. Use configured private credentials in shared environments. Preserve existing volumes and records during upgrades. Q2 was resolved on 17 October: the current Coordinator request → Staff decision flow is the agreed venue-booking policy. Verify the tentative row before approval, Staff approval with a reason, the Coordinator’s approved venue display and unchanged Planning Event; no additional Coordinator venue-confirmation action is required.
