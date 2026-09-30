# How to run ConnectSphere and test it by hand

Everything you need to start the system from a clean clone and check, step
by step, that it behaves as intended. The numbered **MT** checks double as
the documented manual test cases required by the Definition of Done (item 2).

Commands work in **PowerShell** (Windows) and in bash/zsh (macOS/Linux)
unless a step says otherwise. Run them from the repo root (the folder with
`README.md`) unless the step says `cd` somewhere.

---

## Part A — One-time setup

You need:

- **Docker Desktop**, running.
- **Node.js 20 or newer** (`node -v`).
- **Git**. Clone the repo normally. `.gitattributes` keeps the shell script's
  line endings correct on Windows.

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
`user-service` and `auth-service` running.

Keycloak takes about 30–60 seconds to be ready. Until then, logins return
"temporarily unavailable".

To watch the two services start:

```powershell
docker compose -f infra/docker-compose.yml logs -f auth-service user-service
```

Wait for `auth-service listening on port 3000` and
`Keycloak lockout and password rules synced from auth_db`, then press Ctrl+C.

### B2. Load the seed data (once)

The tables are created automatically when the services start. Then load the
seed rows. `docker compose cp` works in both PowerShell and bash (PowerShell
has no `<` redirect):

```powershell
docker compose -f infra/docker-compose.yml cp backend/seed_data/01_user_db.sql postgres:/tmp/01_user_db.sql
docker compose -f infra/docker-compose.yml cp backend/seed_data/02_auth_db.sql postgres:/tmp/02_auth_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d user_db -f /tmp/01_user_db.sql
docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d auth_db -f /tmp/02_auth_db.sql
```

Each should end with `COMMIT`. Running them twice is safe.

Only the user and auth seeds are loaded for now: the other six databases
have no service (and so no tables) yet.

### B3. Useful addresses

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
  the seed users (list below). Event pages are still mock data belonging to
  mock users, so a real organiser sees an empty list. That is expected
  until event-service exists.

Leave `NUXT_API_BASE_URL=http://localhost:8000`. Leave the
`NUXT_SESSION_PASSWORD` line commented out. Nuxt generates one on first
start. An **empty** value (`NUXT_SESSION_PASSWORD=`) breaks login with
"Empty password".

```powershell
npm run dev
```

Open http://localhost:3000. The first load of each page takes a few seconds
while Nuxt compiles it.

### Seed users (live mode). Password for all: `Password123!`

| Role | Email |
|---|---|
| Event Organiser | sarah.tan@nexuslabs.sg, daniel.lim@brightpath.edu.sg |
| Event Coordinator | aisha.rahman@connectsphere.sg, kevin.ong@connectsphere.sg |
| Venue Staff | ravi.kumar@marinaconvention.sg |
| Technical Support | hafiz.ismail@connectsphere.sg, chloe.ng@connectsphere.sg |
| Attendee | ethan.goh@gmail.com |

---

## Part D — Manual test cases

Run these in **live mode** unless stated. Tick each one; if a result
differs, note what you saw.

### Login and logout (website)

| # | Steps | Expected |
|---|---|---|
| MT-01 | On /login, enter `sarah.tan@nexuslabs.sg` with a wrong password | "Invalid credentials". Same message for an unknown email (try `nobody@x.com`) |
| MT-02 | Log in as `sarah.tan@nexuslabs.sg` | Lands on **Your events** (empty list in live mode) |
| MT-03 | Click the initials (top right), then **Sign out** | Shows Sarah Tan, `EVENT_ORGANISER`, her email. Sign out returns to /login. In pgAdmin, `auth_db.sessions`: her newest session now has `revokedAt` set |
| MT-04 | Log in as `aisha.rahman@connectsphere.sg` | Lands on **Review queue** |
| MT-05 | Log in as `hafiz.ismail@connectsphere.sg` (also try Venue Staff and Attendee) | Shows "Signed in as …" but stays on /login. **Correct for now**: the access matrix says these roles have no interface yet |
| MT-06 | Signed out, go to http://localhost:3000/ | Redirected to /login |
| MT-07 | Log in as Aisha, then refresh the page | Still logged in |

### Security rules (website)

| # | Steps | Expected |
|---|---|---|
| MT-08 | Enter a wrong password for `kevin.ong@connectsphere.sg` **5 times**, then the right one | Still "Invalid credentials": the account is locked. After about 1 minute the right password works. (More than 10 attempts a minute from your machine gives a "too many requests" error from Kong. That's the separate rate limit.) |
| MT-09 | In browser dev tools → Application → Cookies, look at the session cookie | Marked **HttpOnly**. Local/session storage contains no token |

### Tech support admin (Swagger UI)

Tech support has no screens yet, so use Swagger at http://localhost:3002/docs.
Check that the server dropdown at the top shows `http://localhost:3002`.

**Get a token (needed for MT-10 onwards):**

1. Expand `POST /auth/login` → **Try it out**.
2. Body: `{ "email": "hafiz.ismail@connectsphere.sg", "password": "Password123!" }` → **Execute**.
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
| MT-16 | On the website, log in as `test.user@connectsphere.sg` / `LongerPass1!` | Logs in (stays on /login as an attendee, like MT-05) |
| MT-17 | `PATCH /admin/users/{id}/role` with `{ "role": "EVENT_ORGANISER" }`, then in the browser where test.user is logged in, open http://localhost:3000/ | **Your events**, without logging in again. The new role is picked up on page load |
| MT-18 | `PATCH /admin/users/{id}/status` with `{ "isActive": false }`, then refresh that browser tab | Logged out. Logging in again says "Invalid credentials". Re-enable with `true` |
| MT-19 | `PATCH /admin/users/{Hafiz's own id}/role` (id `a1000000-0000-4000-8000-000000000011`) | 400 "You cannot change your own role" |
| MT-20 | `GET /admin/audit-logs` | One entry per change you made above, newest first |

### Permissions

| # | Steps | Expected |
|---|---|---|
| MT-21 | Log in via Swagger as `aisha.rahman@connectsphere.sg`, Authorize with her token, `GET /admin/users` | **403** "You do not have permission to do this" |
| MT-22 | As Hafiz again, `PUT /admin/roles/EVENT_COORDINATOR/permissions` with the current coordinator list **plus** `"users.view"` (see `GET /admin/permissions`) | 200. As Aisha, `GET /admin/users` now works. Put the list back afterwards |
| MT-23 | As Hafiz, `PUT /admin/roles/TECHNICAL_SUPPORT_STAFF/permissions` with `{ "permissions": [] }` | 200, but `users.manage` and `permissions.manage` are still there (protected) |

### Database (pgAdmin4)

| # | Steps | Expected |
|---|---|---|
| MT-24 | Open `auth_db` → `sessions` | `tokenHash` holds 64-character hashes, never the token itself |
| MT-25 | Open `auth_db` → `auth_settings`, `role_permissions`, `audit_logs` | Rows match what you did in MT-10 to MT-23 |

### Automated tests

| # | Steps | Expected |
|---|---|---|
| MT-26 | `cd frontend` then `npm test` | **75 passed, 20 failed.** The 20 are known and unrelated to auth: 19 CS-11 tests call routes not built yet, and 1 CS-30 test expects a disabled "Change coordinator" button. Any *other* failure is a regression |

---

## Part E — Stop, reset, troubleshoot

```powershell
docker compose -f infra/docker-compose.yml down        # stop, keep data
docker compose -f infra/docker-compose.yml down -v     # stop and WIPE all data (then redo B2)
```

After `down -v`, Keycloak also starts fresh from `infra/keycloak/connectsphere-realm.json`.

| Symptom | Fix |
|---|---|
| Website login says "The ConnectSphere service is unavailable" | Backend not running, or Keycloak still starting. Check Part B1 |
| "Invalid credentials" for a seed user in live mode | Did B2 run? Is the account locked (MT-08)? Is `NUXT_AUTH_MODE=live`? |
| Swagger "Try it out" fails with a network/CORS error | Pick `http://localhost:3002` in the server dropdown |
| `auth-service` exits with "Missing required environment variable" | Compose file edited? Compare with the repo version |
| Postgres logs `$'\r': command not found` | `init-databases.sh` has Windows line endings. Run `git add --renormalize .` and re-clone, or convert the file to LF, then `down -v` and `up` |
| Every login fails; browser dev tools show 500 "Empty password" | `frontend/.env` has `NUXT_SESSION_PASSWORD=` with nothing after it. Delete that line (or give it 32+ characters) and restart `npm run dev` |
| Admin screens / `/api/admin/...` return 501 | Website is in mock mode. Set `NUXT_AUTH_MODE=live` |
