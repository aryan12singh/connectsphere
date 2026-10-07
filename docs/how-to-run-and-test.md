# How to run ConnectSphere and test it by hand

Everything you need to start the system from a clean clone and check, step
by step, that it behaves as intended. The numbered **MT** checks double as
the documented manual test cases required by the Definition of Done (item 2).

Commands work in **PowerShell** (Windows) and in bash/zsh (macOS/Linux)
unless a step says otherwise. Run them from the repo root (the folder with
`README.md`) unless the step says `cd` somewhere.

For the current Sprint 2 CS-11/29/27/44 request workflow, use the
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
`user-service`, `auth-service`, `event-service`, `venue-service` and
`booking-service` running. `seed` runs once and then shows as exited (B2).

Keycloak takes about 30–60 seconds to be ready. Until then, logins return
"temporarily unavailable".

Keycloak keeps its accounts in Postgres (`keycloak_db`), so accounts made by
sign-up or by tech support survive `down`/`up` and rebuilds. It imports
`infra/keycloak/connectsphere-realm.json` only when `keycloak_db` is empty.

**Upgrading from an older version of this repo (before 2026-10-01)?** Your
Postgres volume has no `keycloak_db` yet (the init script only runs on an empty
volume), and Keycloak will keep restarting. Either wipe everything with
`down -v` and start again, or keep your data and create it once:

```powershell
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d postgres -c "CREATE DATABASE keycloak_db"
docker compose -f infra/docker-compose.yml restart keycloak
```

To watch the services start:

```powershell
docker compose -f infra/docker-compose.yml logs -f auth-service user-service venue-service booking-service
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

### B2. Seed data (loads automatically)

Each service creates its own tables when it starts (`prisma migrate deploy`).
The one-shot `seed` container then waits for those tables and loads the demo
data into `user_db`, `auth_db`, `venue_db`, `event_db` and `booking_db`
(`infra/seed/run-seeds.sh`). Check that it finished:

```powershell
docker compose -f infra/docker-compose.yml logs seed
```

The last line should be `[seed] done`. The seeds are safe to run again:

```powershell
docker compose -f infra/docker-compose.yml up seed
```

If you prefer to load them by hand (same files, same result). `docker compose
cp` works in both PowerShell and bash (PowerShell has no `<` redirect):

```powershell
docker compose -f infra/docker-compose.yml cp backend/seed_data/01_user_db.sql postgres:/tmp/01_user_db.sql
docker compose -f infra/docker-compose.yml cp backend/seed_data/02_auth_db.sql postgres:/tmp/02_auth_db.sql
docker compose -f infra/docker-compose.yml cp backend/seed_data/03_venue_db.sql postgres:/tmp/03_venue_db.sql
docker compose -f infra/docker-compose.yml cp backend/seed_data/05_booking_db.sql postgres:/tmp/05_booking_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d user_db -f /tmp/01_user_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d auth_db -f /tmp/02_auth_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d venue_db -f /tmp/03_venue_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d booking_db -f /tmp/05_booking_db.sql
```

Each should end with `COMMIT`. The event seed is
`services/event-service/prisma/seed/04_event_db.sql` (event-service has no
API yet, so the website does not show these rows).

The remaining databases (attendance, messaging, notification, orchestrator)
are reserved for services still marked `not-built-yet` in the compose file.

### B3. Postman collections

Import the collection for the service you want to exercise:

- `services/booking-service/postman/booking-service.postman_collection.json` — logs in through Kong as a coordinator and Venue Staff, then covers booking creation (coordinator), idempotent retry, retrieval, a Venue Staff status change, history and availability.
- `services/venue-service/postman/venue-service.postman_collection.json` — logs in through Kong as an Event Coordinator and Venue Staff, then covers venue options, listing, CRUD, operating-hours replacement, history and empty-hours validation.

Both collections log in as the seed users Aisha (coordinator, `Aisha@CS05!`)
and Ravi (Venue Staff, `Ravi@CS08!`) and use the seeded Marina Convention
Centre. Change the `coordinatorPassword` / `venueStaffPassword` variables if
you use other accounts.

### B4. Useful addresses

| What | Address | Login |
|---|---|---|
| Swagger UI (auth-service API) | http://localhost:3002/docs | — |
| Keycloak admin console | http://localhost:8080 | admin / admin |
| pgAdmin4 | http://localhost:5050 | admin@connectsphere.dev / admin |
| RabbitMQ console | http://localhost:15672 | guest / guest |
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

- `NUXT_AUTH_MODE=mock`. Mock users, no backend needed. Use this to see the
  event pages with data: `organiser@example.com` or
  `coordinator@example.com`, password `Password123!`.
- `NUXT_AUTH_MODE=live`. Real login through the backend from Part B, with
  the seed users (list below). Event requests, drafts and history use event-service and PostgreSQL. Role homes and grants are described in [the access matrix](access-matrix.md).

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
`backend/seed_data/01_user_db.sql`. The ones used in the test cases:

| Role | Email | Password |
|---|---|---|
| Event Organiser | sarah.tan@nexuslabs.sg | `Sarah@CS01!` |
| Event Organiser | daniel.lim@brightpath.edu.sg | `Daniel@CS02!` |
| Event Coordinator | aisha.rahman@connectsphere.sg | `Aisha@CS05!` |
| Event Coordinator | kevin.ong@connectsphere.sg | `Kevin@CS06!` |
| Venue Staff | ravi.kumar@marinaconvention.sg | `Ravi@CS08!` |
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
| MT-05 | Log in as `hafiz.ismail@connectsphere.sg` (also try Attendee `ethan.goh@gmail.com`) | Shows "Signed in as …" but stays on /login. **Correct for now**: the access matrix says these roles have no interface yet. (Venue Staff now land on /venue — see MT-36) |
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
| MT-34 | As Hafiz, `PUT /admin/settings` `{ "passwordMinLength": 12 }`, then reload /signup | The first rule now says "At least 12 characters", and an 8-character password is refused. Set it back to 8 |
| MT-35 | `docker compose -f infra/docker-compose.yml restart keycloak`, wait a minute, log in as `test.attendee@example.com` | Still works: Keycloak kept the account in Postgres |

### Venues and venue bookings (website, live mode)

Rules (decided 2026-10-07): only Event Coordinators create bookings; only
Venue Staff change a booking's status; coordinators see other people's
bookings only as "Not available"; the server refuses overlaps.

| # | Steps | Expected |
|---|---|---|
| MT-36 | Log in as Venue Staff `ravi.kumar@marinaconvention.sg` / `Ravi@CS08!` | Lands on **Manage venues** with 3 venues. No **New booking** button; dragging on the calendar does nothing |
| MT-37 | As Ravi: **Edit venue** on one-north Innovation Hub, change capacity to 190, **Save changes**, give a reason, **Continue** | Back on /venue; the card shows Max. 190. `venue_db.venue_history` has a `VENUE_UPDATED` row with your reason |
| MT-38 | As Ravi: **Add new venue**, create "Test Hall", then **Delete venue** on it | Created, then deleted (no 503). Deleting Marina Convention Centre instead gives "Venue has current or future tentative or confirmed bookings" |
| MT-39 | Log in as Coordinator `aisha.rahman@connectsphere.sg` / `Aisha@CS05!`, open **Venues** | Venue list and calendar, but no Edit/Delete/Add venue buttons |
| MT-40 | As Aisha: **New booking** on Marina Convention Centre, pick an event, title and reason, save | Booking appears dashed (Tentatively held). The form had no status picker |
| MT-41 | As Aisha: try a booking that overlaps one already on the calendar | Save is disabled: "This booking overlaps an unavailable interval." |
| MT-42 | Log in as the other coordinator `kevin.ong@connectsphere.sg` / `Kevin@CS06!`, open the same venue and week | Aisha's booking shows only as **Not available** (no title, reason or name) and does not open. In dev tools → Network → `availability`, the item has only id, venueId, startAt, endAt, status, title "Not available" |
| MT-43 | As Ravi: **Booking requests** tab → **Approve** Aisha's booking | It turns Confirmed. `booking_db.venue_booking_activity` has `STATUS_CHANGED` with reason "Approved by venue staff" |
| MT-44 | As Ravi: click a booking on the calendar | A "Change booking status" form: only status (no Blocked option) and a reason can change |
| MT-45 | Swagger/Postman: as Ravi, `POST /venue-bookings` with a valid body and an `Idempotency-Key` | **403** — Venue Staff cannot create bookings |
| MT-46 | As Aisha, `POST /venue-bookings` over a time Kevin already holds (same venue) | **409 `BOOKING_CONFLICT`** "The venue is not available for the selected time" — nothing about Kevin's booking |
| MT-47 | As Aisha, `PUT /venue-bookings/{her booking id}` with `"status": "CANCELLED"` | **403 `STATUS_NOT_PERMITTED`** — only Venue Staff change status |
| MT-48 | As Ravi: edit a venue and untick **Venue is active**. As Aisha, try to book it | The card shows **Inactive**; saving the booking says "This venue is not accepting bookings". Tick it again afterwards |
| MT-49 | Log in as an organiser (`sarah.tan@nexuslabs.sg`) and open http://localhost:3000/venue | Sent back to **Your events** |

### Security rules (website)

| # | Steps | Expected |
|---|---|---|
| MT-08 | Enter a wrong password for `kevin.ong@connectsphere.sg` **5 times**, then the right one | Still "Invalid credentials": the account is locked. After about 1 minute the right password works. (More than 10 attempts a minute from your machine gives a "too many requests" error from Kong. That's the separate rate limit.) |
| MT-09 | In browser dev tools → Application → Cookies, look at the session cookie | Marked **HttpOnly**. Local/session storage contains no token |

### Tech support admin (Swagger UI)

Technical Support has a read-only user directory at `/support`; use Swagger at http://localhost:3002/docs for administrative mutations.
Check that the server dropdown at the top shows `http://localhost:3002`.

**Get a token (needed for MT-10 onwards):**

1. Expand `POST /auth/login` → **Try it out**.
2. Body: `{ "email": "hafiz.ismail@connectsphere.sg", "password": "Hafiz@CS11!" }` → **Execute**.
3. Copy the `token` value from the response.
4. Click **Authorize** (top right), paste the token, then Authorize → Close.

| # | Steps | Expected |
|---|---|---|
| MT-10 | `GET /admin/users`, search `tan` | Sarah Tan in the list. No `passwordHash` anywhere |
| MT-11 | `GET /admin/settings` | `sessionTtlHours: 24`, `lockoutMaxFailures: 5`, … |
| MT-12 | `PUT /admin/settings` with `{ "sessionTtlHours": 0 }` | 400 "Some settings are invalid", with details: "Session length (hours) must be a whole number from 1 to 720" |
| MT-13 | `PUT /admin/settings` with `{ "lockoutMaxFailures": 3 }`. Then in Keycloak admin → realm **connectsphere** → Realm settings → Security defenses → Brute force detection | Keycloak shows max login failures **3**. (Set it back to 5 afterwards.) |
| MT-14 | `POST /admin/users` with `{ "email": "test.user@connectsphere.sg", "firstName": "Test", "lastName": "User", "role": "ATTENDEE", "password": "Short1!" }` | 400 "Password does not meet the password rules" |
| MT-15 | Same, with password `LongerPass1!` | 201 with the new user. Copy its `id` |
| MT-16 | On the website, log in as `test.user@connectsphere.sg` / `LongerPass1!` | Logs in to Attendee home |
| MT-17 | `PATCH /admin/users/{id}/role` with `{ "role": "EVENT_ORGANISER" }`, then in the browser where test.user is logged in, open http://localhost:3000/ | 400 if the Attendee has no organisation link. Seeded staff grants cannot be changed by this endpoint; use Organiser signup for a new organisation-backed account |
| MT-18 | `PATCH /admin/users/{id}/status` with `{ "isActive": false }`, then refresh that browser tab | Logged out. Logging in again says "Invalid credentials". Re-enable with `true` |
| MT-19 | `PATCH /admin/users/{Hafiz's own id}/role` (id `a1000000-0000-4000-8000-000000000011`) | 400 "You cannot change your own role" |
| MT-20 | `GET /admin/audit-logs` | One entry per change you made above, newest first |

### Permissions

| # | Steps | Expected |
|---|---|---|
| MT-21 | Log in via Swagger as `aisha.rahman@connectsphere.sg` / `Aisha@CS05!`, Authorize with her token, `GET /admin/users` | **403** "You do not have permission to do this" |
| MT-22 | As Hafiz again, `PUT /admin/roles/EVENT_COORDINATOR/permissions` with the current coordinator list **plus** `"users.view"` (see `GET /admin/permissions`) | 200. As Aisha, `GET /admin/users` remains403 because user administration is restricted to Technical Support. Put the list back afterwards |
| MT-23 | As Hafiz, `PUT /admin/roles/TECHNICAL_SUPPORT_STAFF/permissions` with `{ "permissions": [] }` | 200, but `users.manage` and `permissions.manage` are still there (protected) |

### Database (pgAdmin4)

| # | Steps | Expected |
|---|---|---|
| MT-24 | Open `auth_db` → `sessions` | `tokenHash` holds 64-character hashes, never the token itself |
| MT-25 | Open `auth_db` → `auth_settings`, `role_permissions`, `audit_logs` | Rows match what you did in MT-10 to MT-23 |

### Automated tests

| # | Steps | Expected |
|---|---|---|
| MT-26 | `cd frontend` then `npm test` | **103 passed, 20 failed** (includes the CS-33/34/35 venue tests and 7 sign-up tests). The 20 are known and unrelated: 19 CS-11 tests call routes not built yet, and 1 CS-30 test expects a disabled "Change coordinator" button. Any *other* failure is a regression |
| MT-26b | In each of `services/venue-service`, `services/booking-service`: `npm run test:unit`, then `npm run test:contract` (needs Python 3). In `services/event-service`: `npm test` | venue 40 + 10, booking 42 + 21, event 89 — all pass |

---

## Part E — Stop, reset, troubleshoot

```powershell
docker compose -f infra/docker-compose.yml down        # stop, keep data
docker compose -f infra/docker-compose.yml down -v     # stop and WIPE all data (then redo B2)
```

After `down -v`, Keycloak also starts fresh from `infra/keycloak/connectsphere-realm.json`,
and every signed-up or admin-created account is gone (redo B2 for the seed users).

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
| Admin screens / `/api/admin/...` return 501 | Website is in mock mode. Set `NUXT_AUTH_MODE=live` |
| Deleting a venue always says "Unable to verify linked bookings" (503) | Your `docker-compose.yml` is older than 2026-10-07: venue-service needs `BOOKING_SERVICE_URL: http://booking-service:3000`. Pull, then `up -d --build venue-service` and `restart kong` |
| Venue pages say "Request failed" or 401 in mock mode | Venue and booking pages need `NUXT_AUTH_MODE=live` and the backend running |
| A booking is refused with "The venue is not available for the selected time" | Another booking (or Venue Staff marking the time unavailable) already holds that time. Pick another time, or ask Venue Staff |
| `seed` exited with `TIMEOUT: … never appeared` | A service failed to migrate. Check `docker compose -f infra/docker-compose.yml logs <service>`, fix, then `up seed` |
