#!/usr/bin/env bash
# Fresh CI/review stack only. Never reseed or remove an existing review volume.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${CSE2E_PROJECT:?Set a unique csreview-aryan-ci- project name}"
: "${CSE2E_WORK_DIR:?Set a new absolute directory outside the checkout}"
if [[ ! "$CSE2E_PROJECT" =~ ^csreview-aryan-ci-[a-z0-9-]+$ ]]; then
  echo 'Only a unique csreview-aryan-ci- project is permitted' >&2; exit 2
fi
if [[ "$CSE2E_WORK_DIR" != /* || -e "$CSE2E_WORK_DIR" ]]; then
  echo 'Use a new absolute work directory; existing evidence is retained' >&2; exit 2
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]]; then
  echo 'Use Node.js 22 for this reproducible runner' >&2; exit 2
fi
cd "$ROOT"
# Keep stopped services' published ports outside Linux's ephemeral client range
# so outbound reconnect attempts cannot claim them during restart checks.
PORT_BASE="${CSE2E_PORT_BASE:-13000}"
COMPOSE="$CSE2E_WORK_DIR/compose.json"
EVIDENCE="$CSE2E_WORK_DIR/evidence"
python3 scripts/prepare-event-review.py --project "$CSE2E_PROJECT" --output "$COMPOSE" --port-base "$PORT_BASE"
mkdir -p "$EVIDENCE"
compose() { docker compose -f "$COMPOSE" "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  compose logs --no-color kong user-service auth-service event-service venue-service booking-service attendance-service notification-service equipment-service rabbitmq frontend > "$EVIDENCE/services.log" 2>&1 || true
  compose down > "$EVIDENCE/stop.log" 2>&1 || true
  # The project-scoped volume is intentionally retained, including on failure.
  exit "$result"
}
trap cleanup EXIT
export NUXT_AUTH_MODE=live
node tests/scripts/validate-equipment-traceability.cjs
npm run build --prefix frontend > "$EVIDENCE/frontend-build.log" 2>&1
compose up -d --build postgres keycloak user-service auth-service event-service venue-service booking-service attendance-service notification-service equipment-service rabbitmq kong > "$EVIDENCE/stack-start.log" 2>&1
wait_http() {
  for attempt in $(seq 1 120); do
    if curl --silent --fail "$1" > /dev/null; then return 0; fi
    sleep 1
  done
  echo "Readiness timeout for $1" >&2; return 1
}
wait_http "http://127.0.0.1:$((PORT_BASE + 5080))/realms/connectsphere"
wait_http "http://127.0.0.1:$((PORT_BASE + 1))/health"
compose run --rm seed > "$EVIDENCE/seed.log" 2>&1
compose up -d frontend > "$EVIDENCE/frontend-start.log" 2>&1
export FRONTEND_BASE="http://127.0.0.1:$PORT_BASE"
export KONG_BASE="http://127.0.0.1:$((PORT_BASE + 5000))"
export AUTH_DATABASE_URL="postgresql://connectsphere:connectsphere@127.0.0.1:$((PORT_BASE + 2432))/auth_db"
export SMOKE_EVIDENCE="$EVIDENCE/persistent-ids.json"
export CSE2E_COMPOSE_FILE="$COMPOSE"
export CSE2E_EVIDENCE_DIR="$EVIDENCE/browser"
wait_http "$FRONTEND_BASE/login"
export RABBITMQ_URL="amqp://connectsphere:connectsphere-dev-only@127.0.0.1:$((PORT_BASE + 5672))"
export CS_BUS_RESULT="$EVIDENCE/booking-notification.json"
(cd frontend && CS_BUS_ACCEPTANCE=1 CS_BUS_FAULT_ACCEPTANCE=1 TEST_RESULTS_JSON="$EVIDENCE/notification-results.json" TEST_RECORD_STORIES=CS-39 TEST_EVIDENCE_LAYER='Real Kong, Keycloak, PostgreSQL and RabbitMQ' npm run test:report -- ../tests/specs/CS-39.spec.ts --reporter=default) 2>&1 | tee "$EVIDENCE/notification-integration.log"
(cd frontend && CS_SAFETY_ACCEPTANCE=1 TEST_RESULTS_JSON="$EVIDENCE/safety-results.json" TEST_RECORD_STORIES=CS-93,CS-95 TEST_EVIDENCE_LAYER='Real Safety lifecycle, PostgreSQL reservations, Keycloak and RabbitMQ' npm run test:report -- ../tests/specs/CS-93.spec.ts ../tests/specs/CS-95.spec.ts --no-file-parallelism --reporter=default) 2>&1 | tee "$EVIDENCE/safety-integration.log"
(cd frontend && CS_MAINTENANCE_ACCEPTANCE=1 TEST_RESULTS_JSON="$EVIDENCE/maintenance-results.json" TEST_RECORD_STORIES=CS-84 TEST_EVIDENCE_LAYER='Actual PostgreSQL before-commit Venue barrier and timeout recovery' npm run test:report -- ../tests/specs/CS-84.spec.ts --reporter=default) 2>&1 | tee "$EVIDENCE/maintenance-integration.log"
node services/event-service/tests/smoke/live.cjs | tee "$EVIDENCE/live-smoke.log"
(cd frontend && npm run test:e2e:report) | tee "$EVIDENCE/browser.log"
compose restart event-service user-service auth-service venue-service booking-service attendance-service notification-service equipment-service rabbitmq frontend > "$EVIDENCE/restart.log" 2>&1
node services/event-service/tests/smoke/live.cjs --verify-restart | tee "$EVIDENCE/restart-smoke.log"
python3 - "$EVIDENCE/browser/results.json" <<'PYRESULT'
import json, sys
r = json.load(open(sys.argv[1]))
s = r['stats']
expected_stubs = 6  # TC-CS47-02, 06 and 07 in desktop and mobile projects.
assert s['unexpected'] == 0 and s['flaky'] == 0 and s['skipped'] == expected_stubs and s['expected'] > 0, s
print('Browser results:', s)
PYRESULT
