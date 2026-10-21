# Acceptance test guide — Login related stories (CS-10, CS-26, CS-50, CS-51, CS-79)

Step-by-step checks for every acceptance criterion and PO-sheet case, with the
screenshot to take for each. Written 21 October 2026 against main `a7749cb`
plus the CS-10 Coordinator Lead change.

**Screenshot names.** Use the Jira style already on the cards:
`TC-CS10-18__UI_lead-queue.png`, `TC-CS26-05__API_duplicate-email.png`, etc.
Always include the browser **address bar** (for UI) or the **request + response**
(for Swagger/API). Paste each into the matching row of `tests/records/CS-xx/test-cases.md`
with the date and commit (`git rev-parse --short HEAD`).

---

## 0. One-time setup

1. Start everything (Git Bash, repo root):
   ```bash
   git checkout main && git pull
   docker compose -f infra/docker-compose.yml up -d --build
   docker compose -f infra/docker-compose.yml run --rm seed
   ```
   The services run their own migrations on start, including the two new
   `20261021000000_coordinator_lead` migrations.
2. **Existing volumes only** (if you already had Keycloak data): add the new Lead
   login to Keycloak.
   - Open http://localhost:8080 (admin / admin), realm **connectsphere**.
   - Go to **Realm settings → Action → Partial import**.
   - Choose `infra/keycloak/connectsphere-realm.json`, tick **Users**, set
     "If a resource exists" to **Skip**, and click **Import**.

   Do the same if the Safety Officer (Alex Chen) can't log in.
3. Open http://localhost:3000.

**Accounts** (live mode):

| Role | Email | Password |
|---|---|---|
| Organiser (org Nexus Labs) | sarah.tan@nexuslabs.sg | Sarah@CS01! |
| Organiser (same org) | daniel.lim@brightpath.edu.sg | Daniel@CS02! |
| Organiser (other org) / Organiser+Attendee | priya.raman@greenleaf.org.sg | Priya@CS03! |
| Coordinator | aisha.rahman@connectsphere.sg | Aisha@CS05! |
| Coordinator | kevin.ong@connectsphere.sg | Kevin@CS06! |
| Venue Staff | ravi.kumar@marinaconvention.sg | Ravi@CS08! |
| Technical Support | hafiz.ismail@connectsphere.sg | Hafiz@CS11! |
| Attendee | ethan.goh@gmail.com | Ethan@CS13! |
| Safety Officer | alex.chen@connectsphere.sg | Alex@CS31! |
| **Coordinator Lead (new)** | jordan.lim@connectsphere.sg | Jordan@CS32! |

**Swagger** for API steps: http://localhost:3002/docs (auth-service). For calls
that need a login, run `POST /auth/login` first and paste the returned `token`
into **Authorize**.

**Automated evidence** (screenshot the terminal summary for each story):
```bash
# frontend (CS-10, CS-26, CS-50 bell)
cd frontend
DATABASE_URL=postgresql://connectsphere:connectsphere@localhost:5432/event_db NUXT_AUTH_MODE=mock \
NUXT_SESSION_PASSWORD=isolated-ci-cookie-password-at-least-32-characters npx vitest run CS-10 CS-26 CS-50
# services (needs the *_test databases, see docs/how-to-run-and-test.md)
cd ../services/auth-service && npm run test:coverage              # TC-CS26-05/06/07, TC-CS10-21
cd ../event-service && DATABASE_URL=postgresql://connectsphere:connectsphere@localhost:5432/event_test npm run test:integration   # TC-CS10-22/23, TC-CS50-06
cd ../notification-service && npm run test:unit && npm run test:contract   # CS-50/51 notice rules
```

---

## 1. CS-10 — Secure login and role-based navigation

### Sprint 2 ACs (short table 10-01 to 10-07)

| Case | Steps | Expected | Screenshot |
|---|---|---|---|
| 10-01 Valid login, each role | Log in as each account above (one at a time, log out between) | Organiser/Coordinator → `/`, Venue Staff → `/venue`, Technical Support → `/technical-support`, Attendee → `/attendee`, Safety Officer → `/safety-checks`, Lead → `/queue` | One per role: landing page with URL |
| 10-02 Back after logout | Log in, open a page, account menu (initials, top right) → **Sign out**, press browser **Back** | Login page; no protected data shown | Login page after Back |
| 10-03 No session | In a private window open http://localhost:3000/venue | Redirected to `/login`. API: Swagger `GET /auth/me` without Authorize → **401** | Both |
| 10-04 Wrong password / unknown email | Log in with a right email + wrong password; then an unknown email | Same generic error both times, no session | Both error screens |
| 10-05 No recognised role | Covered by the automated test `TC-CS10-05` / `TC-CS10-11` (unknown role → Access Denied, never a default role). Can't be created in live data on purpose | Test passes | Test run |
| 10-06 Call API after logout | Swagger: login → copy token → `POST /auth/logout` → `GET /auth/me` with the same token | **401** | Swagger responses |
| 10-07 Idle timeout | As Technical Support, Swagger `PUT /admin/settings` with `"idleTimeoutMinutes": 1`; log in as another user; wait 1 min idle; click any page | Sent to login. The exact 29:59 / 30:00 / 30:01 boundary is proven by `TC-CS10-13`. Set the timeout back afterwards (default is 0 = off) | Settings response, then the redirect |
| Multi-role switch | Log in as Priya (Organiser + Attendee) → account menu → **Active role** → Attendee | Moves to `/attendee` without logging in again; switch back works | Menu + new home |

### Week 7 cases (PO sheet)

| Case | Steps | Expected | Screenshot |
|---|---|---|---|
| **TC-CS10-18** new roles land correctly | Log in as Jordan Lim (Lead), then as Alex Chen (Safety Officer) | Lead → **/queue** "Unassigned Queue"; Safety Officer → **/safety-checks** "Pending Safety Checks" | Both landings with URL |
| **TC-CS10-19** Safety Officer can't edit venues | As Alex: look at the top menu (no Venues / Edit venue); then type `http://localhost:3000/venue` and `/venue/<any venue id>` | Menu shows only Safety checks + Home; both URLs → **Access Denied**. (The sheet's `/venues/V1/edit` is illustrative; the app's page is `/venue/<id>`) | Menu; Access Denied |
| **TC-CS10-20** 7-role matrix | Run the frontend command above | "TC-CS10-20 / TC-CS26-04 every role x every action…" passes; table in `docs/access-matrix.md` | Test run + matrix table |
| **TC-CS10-21** can't self-register as Safety Officer | Swagger `POST /auth/register` with a new email and `"role": "SAFETY_OFFICER"` (repeat with `EVENT_COORDINATOR_LEAD`) | **400**; logging in with that email fails (no account) | Request/response |
| **TC-CS10-22** Lead can't approve | As Jordan: type `/requests/<a submitted request id>` | Access Denied. Server side: event-service test `TC-CS10-22` (403, status/version unchanged) | Access Denied + test run |
| **TC-CS10-23** Safety Officer can't edit event details | As Alex: type `/requests/<id>` | Access Denied. Server side: `TC-CS10-23` (403/404, attendance unchanged) | Access Denied + test run |
| **TC-CS10-24** Safety access starts at the safety stage | 1) As a Coordinator, **Approve** a request in the Review queue → the Event is in Planning. As Alex: it is **not** in Pending Safety Checks. 2) Coordinator opens `/events/<id>`, completes arrangements, clicks **Send for Safety Check**. As Alex: it **appears** and opens. 3) Alex approves it: the round still opens from history | Not visible → visible → still visible | One per stage |
| Lead menu hides other actions | As Jordan: top menu | Only **Unassigned queue** and **Home**. `/venue`, `/safety-checks`, `/technical-support` → Access Denied | Menu; one denial |

Note for the record: the Lead's queue contents and assign/reassign are
**CS-81 / CS-30**. The `/queue` page says so. Q11 (exact Lead authority) is still pending.

---

## 2. CS-26 — Accounts and role/relationship permissions

| Case | Steps | Expected | Screenshot |
|---|---|---|---|
| **TC-CS26-01** Attendee signs up | `/signup` → Attendee, name, new email, password `Passw0rd!` → submit; then log in | Account created; login lands on `/attendee`. pgAdmin (http://localhost:5050) `user_db.users`: role `ATTENDEE`; the password is not stored in plain text (it's in Keycloak) | Success screen; DB row |
| Organiser sign-up | `/signup` → Organiser with organisation name | Created; lands on `/` | Success screen |
| **TC-CS26-02** Venue Staff typed review URL | As Ravi: no "Review" menu; type `/requests/<id>` | Access Denied | Menu; Access Denied |
| **TC-CS26-03** Organiser A opens B's request | As Sarah create/submit a request, copy its id from the URL. As Priya (other org) open `/requests/<that id>` | "This request is unavailable…"; API returns **403/404** with an error body only (Network tab) | Page + Network tab |
| **TC-CS26-04** matrix | Same test run as TC-CS10-20 | Passes for 7 roles | Test run |
| **TC-CS26-05** duplicate email | `/signup` with `sarah.tan@nexuslabs.sg` | "already registered"-style message on the email field; no second account | Field error |
| **TC-CS26-06** tamper role = Coordinator | Swagger `POST /auth/register` with `"role": "EVENT_COORDINATOR"` | **400**; no account, no staff profile (check `user_db.users`) | Response + DB |
| **TC-CS26-07** password 7 / 8 / 9 chars | Sign up three new emails with `Abc123!`, `Abc1234!`, `Abc12345!` | 7 rejected with a field message; 8 and 9 accepted (min length is a Technical Support setting, default 8) | Three results |
| Coordinator only on assigned events | As Kevin: try `/requests/<id>` of a request assigned to Aisha | Unavailable / 403 | Page |

---

## 3. CS-50 — Event lifecycle and Coordinator assignment notifications

Live through RabbitMQ on main. RabbitMQ UI: http://localhost:15672
(connectsphere / connectsphere-dev-only) → **Queues** →
`notification-service.domain-events`.

| Case | Steps | Expected | Screenshot |
|---|---|---|---|
| **TC-CS50-01** approval notice | As Sarah submit a request (**New event request**). As the assigned Coordinator, on the Review queue (`/`) select it and click **Approve**. As Sarah open the 🔔 bell | Exactly one "Your event request "…" was approved. Planning has started." Clicking it opens `/events/<id>` | Bell list |
| (submission/assignment) | Right after submitting, Sarah's bell | "…was submitted…" and "<Coordinator> is now the Coordinator for …". The Coordinator gets "You have been assigned…" | Both bells |
| **TC-CS50-02** reassignment | As the assigned Coordinator, Review queue → select the request → **Reassign** → choose the other Coordinator → confirm | Old Coordinator: "…reassigned… no longer have access" (not clickable). New: "You have been assigned…". Sarah: "Your Coordinator for … has changed to <name>" | Three bells |
| **TC-CS50-03** open from the bell | As Sarah: note the badge number → click 🔔 → click the approval notice → come back | Event page opens; badge decreases / disappears; still read after reload | Badge before, page, badge after |
| **TC-CS50-04** others can't see it | As Priya open the bell | No notice about Sarah's event. API (through Kong): log in as Priya in Swagger to get a token, then `curl -i http://localhost:8000/notifications/<Sarah's notice id> -H "Authorization: Bearer <Priya's token>"` → **404**. (Find the id in pgAdmin `notification_db.notifications`.) | Empty bell |
| **TC-CS50-05** no duplicates | Automated (notification contract `test_cs50_05`, PostgreSQL 10× parallel). Live: stop RabbitMQ (`docker compose -f infra/docker-compose.yml stop rabbitmq`), submit a request, start it again | The request saves; the notices arrive after restart, once each | Test run; bell after restart |
| **TC-CS50-06** failed action sends nothing | Try to approve a request that is already Rejected (or with a stale page) | Error shown; no new notice | Error + unchanged bell |
| **TC-CS50-07** badge 99+ | Automated (`test_cs50_07`: 98, 99, "99+") | Passes | Test run |
| Failed deliveries list | As Hafiz open `/technical-support` | Card "Failed notification deliveries" (normally empty) | Card |

---

## 4. CS-51 — Planning decisions and staff action notifications

| Case | Steps | Expected | Screenshot |
|---|---|---|---|
| **TC-CS51-01** venue rejection with reason | As the Coordinator open the approved event `/events/<id>` → request a venue with a reason. As Ravi `/venue` → **Booking requests** → type a reason "Stage refurbishment" → **Reject** | Coordinator's bell: "The venue booking … was rejected. Reason: Stage refurbishment…". Sarah's bell: "A venue … was not approved…", **without** the reason | Both bells |
| **TC-CS51-02** venue made unavailable | Coordinator holds a venue; Ravi blocks that time on the venue calendar | Coordinator: "…no longer available… kept and marked for replacement…". Sarah: "…needs to be replaced…" with no internal reason. Note for the record: main flags the booking `BUFFER_CONFLICT`; the sheet expects `NEEDS_REPLACEMENT` (agree with Aryan/PO) | Both bells |
| **TC-CS51-03** new request notice for staff | Coordinator requests a venue; Ravi (and Grace) open the bell → click | "New booking request for …"; opens `/venue`. Note: there's no `/venue-bookings/<id>/review` page, so the workspace opens instead | Bell + page |
| **TC-CS51-04** Organiser sees no internal notices | After 01–02, Sarah's bell | No "buffer conflict"/"no longer available" notices and no "Maintenance"/reason text | Bell |
| **TC-CS51-05** extension moves the warning | Coordinator **Request hold extension**; Ravi **Approve extension** | Coordinator: "Venue Staff extended the tentative hold … to <new time>". The warning-timing rule is booking-service's (`docs/hold-expiry.md`) | Bells |
| **TC-CS51-06** Safety change request goes only to the affected area | Coordinator sends for Safety; Alex requests changes, area **Equipment**, reason "Cable run blocks exit" | Coordinator + Sarah + Technical Support notified (with the comment); Venue Staff **not** | Four bells |
| **TC-CS51-07** 24 h warning time | Owned by the hold scheduler; screenshot the booking-service hold test run (`npm run test:hold-spike`) | Passes | Test run |
| Return with comments (card AC1) | Coordinator, Review queue → type "Add layout" in *Reason / amendment comments* → **Ask for amendments** | Sarah: "…returned for changes. The Coordinator's comments: "Add layout"" | Bell |

---

## 5. CS-79 — Coverage and integration gates

| Criterion | How to show it | Screenshot |
|---|---|---|
| Policy recorded (metric, scope, exclusions, floors) | `docs/coverage-policy.md` | Floors table |
| Coverage failures fail CI | GitHub → **Actions** → latest main run of "event-workflows" → all jobs green; open the frontend job → "Verify coverage failures propagate…" step | Run summary; that step's log |
| Floors enforced per app/service | Locally `cd frontend && npm run test:coverage` (prints statements/branches/functions/lines; fails if under 65/60/65/65). Each service's `npm run test:coverage` / `test:integration` has `--test-coverage-*` floors in its `package.json` | Coverage summary |
| Week 7 slices tested continuously | The same CI run includes seven-role access (CS-10 spec), notifications, buffers, holds, Safety | Job list |
| Clean-checkout integrated slice | CI "Live E2E and restart checks" job | Job result |

Remaining on the card itself: independent review/approval is a team step, not code.

---

## Known differences to note on the cards

- TC-CS51-02: flag name `BUFFER_CONFLICT` on main vs `NEEDS_REPLACEMENT` on the sheet.
- TC-CS51-01/03: notice links open `/venue` (no booking review page yet, CS-38).
- TC-CS10-19: the venue edit URL is `/venue/<id>`, not `/venues/V1/edit`.
- TC-CS10-07: the idle timeout is off by default; set it in Settings to test.
- Lead queue contents and assignment: CS-81 / CS-30. Lead authority: Q11 pending.
