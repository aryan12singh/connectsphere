# Independent local review recipe

Use Docker Desktop, Python 3.9 or newer, curl and Bash (macOS/Linux, or WSL). The commands run the locked dependencies with Node 22 containers. This recipe generates a **new** project with a project-specific PostgreSQL 16 volume and loopback ports. It uses checked-in synthetic development defaults. Choose an unused project/path and free ports; the helper refuses an existing config, running project or occupied port.

Run the following blocks in the same Bash session, from a clean checkout containing the complete feature branch. The original backend-only checkpoint does not include this recipe or frontend changes. Pick the source revision supplied with the final handoff; an old remote checkpoint is insufficient.

```bash
cs_review_project="csreview-aryan-$(date -u +%Y%m%d%H%M%S)"
cs_review_dir="$PWD/../$cs_review_project"
cs_review_compose="$cs_review_dir/compose.json"
cs_review_port_base=23000
cs_review_pg_port=$((cs_review_port_base + 2432))
cs_review_kong_port=$((cs_review_port_base + 5000))
cs_review_event_port=$((cs_review_port_base + 3))

# Test containers reach loopback-published ports through Docker Desktop.
# Native Linux uses host networking so these ports remain loopback-only.
cs_review_test_host=host.docker.internal
cs_review_test_network=()
if [ "$(uname -s)" = Linux ]; then
  cs_review_test_host=127.0.0.1
  cs_review_test_network=(--network host)
fi

git rev-parse HEAD
git status --short
python3 scripts/prepare-event-review.py \
  --project "$cs_review_project" --output "$cs_review_compose" \
  --port-base "$cs_review_port_base"

docker run --rm -v "$PWD:/app" -w /app/services/event-service node:22-bookworm npm ci
docker run --rm -v "$PWD:/app" -w /app/services/event-service node:22-bookworm npm run build
# Preserved CS-33 frontend regressions import the real venue validator/config.
docker run --rm -v "$PWD:/app" -w /app/services/venue-service node:22-bookworm npm ci
docker run --rm -v "$PWD:/app" -w /app/frontend node:22-bookworm npm ci
docker run --rm -v "$PWD:/app" -w /app/frontend node:22-bookworm npm run build

docker compose -f "$cs_review_compose" up -d --build postgres keycloak user-service auth-service event-service venue-service booking-service kong
docker compose -f "$cs_review_compose" run --rm seed
docker compose -f "$cs_review_compose" up -d frontend

curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:$cs_review_event_port/health"
curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:$cs_review_kong_port/auth/password-policy"
curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:$cs_review_port_base/login" -o /dev/null
docker compose -f "$cs_review_compose" ps
```

When rebuilding an already running production frontend, stop that project’s frontend first, rebuild, then start it. Its in-memory entry points must match the generated assets; building over a running bind-mounted .output produces stale chunk errors.

The helper preserves absolute binds/build contexts in this checkout; keep the checkout at that path while running its stack. Every port binds to 127.0.0.1. With base 23000 the frontend is 23000; user/auth/event are 23001/23002/23003; venue/booking 23005/23006; PostgreSQL 25432; Kong/admin 28000/28001; Keycloak 28080. To use another base, change only `cs_review_port_base` before the setup block; all later database and smoke URLs derive from it. If startup fails, inspect `docker compose -f "$cs_review_compose" logs --tail=80 auth-service keycloak event-service` before continuing. Keycloak can need extra startup time; unavailable live auth is a failed check.

```bash
# API/domain and full branch coverage on the isolated migrated DB
docker run --rm "${cs_review_test_network[@]}" -v "$PWD:/app" -w /app/services/event-service \
  -e "DATABASE_URL=postgresql://connectsphere:connectsphere@$cs_review_test_host:$cs_review_pg_port/event_db" \
  node:22-bookworm npm run test:coverage
# Components + actual H3 routes/PG fixtures; identity/Kong forwarding boundary is a fixture here
docker run --rm "${cs_review_test_network[@]}" -v "$PWD:/app" -v "$cs_review_dir:/evidence" -w /app/frontend \
  -e "DATABASE_URL=postgresql://connectsphere:connectsphere@$cs_review_test_host:$cs_review_pg_port/event_db" \
  -e NUXT_AUTH_MODE=mock \
  -e NUXT_SESSION_PASSWORD=isolated-review-cookie-password-at-least-32-characters \
  -e TEST_RUN_PHASE=GREEN -e TEST_RESULTS_JSON=/evidence/frontend-tests.json \
  node:22-bookworm npm run test:report
docker run --rm -v "$PWD:/app" -w /app/frontend node:22-bookworm npm run typecheck
# Real auth + built BFF/Kong + PG. Only disposable synthetic session expiry is changed.
docker run --rm "${cs_review_test_network[@]}" -v "$PWD:/app" -v "$cs_review_dir:/evidence" -w /app/services/event-service \
  -e "AUTH_DATABASE_URL=postgresql://connectsphere:connectsphere@$cs_review_test_host:$cs_review_pg_port/auth_db" \
  -e "FRONTEND_BASE=http://$cs_review_test_host:$cs_review_port_base" \
  -e "KONG_BASE=http://$cs_review_test_host:$cs_review_kong_port" \
  -e SMOKE_EVIDENCE=/evidence/live-ids.json \
  node:22-bookworm node tests/smoke/live.cjs
docker compose -f "$cs_review_compose" restart event-service frontend
curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:$cs_review_event_port/health"
curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:$cs_review_port_base/login" -o /dev/null
# No reseed/reset: new session retrieves the same UUIDs.
docker run --rm "${cs_review_test_network[@]}" -v "$PWD:/app" -v "$cs_review_dir:/evidence" -w /app/services/event-service \
  -e "FRONTEND_BASE=http://$cs_review_test_host:$cs_review_port_base" \
  -e "KONG_BASE=http://$cs_review_test_host:$cs_review_kong_port" \
  -e SMOKE_EVIDENCE=/evidence/live-ids.json \
  node:22-bookworm node tests/smoke/live.cjs --verify-restart
```

`FRONTEND_BASE`, `KONG_BASE`, `AUTH_DATABASE_URL`, `DATABASE_URL` and `SMOKE_EVIDENCE` are the actual runner environment names. The full frontend regression suite also imports real venue-service validation/config, so its locked venue-service install above is required even when the backend containers have already built. The frontend suite's explicit mock auth uses a fixture identity server while exercising real H3/Express/PostgreSQL routes. The running frontend stays in live mode. The smoke separately exercises actual Keycloak/auth, BFF and Kong. The API rollback test installs/removes a trigger in this disposable event_db; use this isolated project for it.

Save the source revision, start/end times, command, exit status and log for each check. `test:report` creates dated story records and retains failure results; missing legacy cases are recorded as Not Executed. Running tests creates generated records, so the checkout can become dirty after its initial clean-source snapshot. Passing automated checks is one evidence layer; execute the browser demo below and obtain independent review separately.

Native-browser demo (not a substitute for the real API tests):

1. Use the seeded Sarah Organiser. Credential fixture is `infra/keycloak/connectsphere-realm.json`; don't paste passwords into reports. New request: empty Save disabled; purpose alone saves. Draft tab contains it; reopen and verify purpose. Try leaving unsaved edits and cancel the warning.
2. Complete name/purpose/date/time/zone/positive attendance/venue type. Optional registration opens/closes uses the event zone. Submit the same draft; record its unchanged ID, Under Review status and Coordinator. A fresh create submit shows an explicit ID receipt/link. Submitted inputs are read-only.
3. Sign out; sign in as the assigned Aisha/Kevin/Mei Ling fixture. Queue: return with comments. As Sarah open the same request, read comments beside the form, Save changes then Resubmit. Check same Coordinator/ID and expandable old→new history. An unchanged resubmit must409; invalid attendance must422 without clearing entries.
4. Approve as assigned Coordinator: Planning Event link has a different ID. Same-org Daniel can view actual Event history; he cannot see Sarah's private Draft or Request history. Marcus/Attendee/staff cannot read history. Staff's booking Event options show only ID/title/status.
5. Stop only this generated project's services and keep its volume. Reopen with the explicit built-service list below: plain `up -d` would also start the seed service. Do not reseed or delete the volume.

```bash
docker compose -f "$cs_review_compose" stop
docker compose -f "$cs_review_compose" up -d postgres keycloak user-service auth-service event-service venue-service booking-service kong frontend
```

Clean-checkout recipe and scoped CI are supplied; teammate execution and remote CI on the eventual merge commit remain review gates. A passing build does not establish product acceptance or the full DoD.
