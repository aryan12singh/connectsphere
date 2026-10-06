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
PORT_BASE="${CSE2E_PORT_BASE:-33000}"
COMPOSE="$CSE2E_WORK_DIR/compose.json"
EVIDENCE="$CSE2E_WORK_DIR/evidence"
python3 scripts/prepare-event-review.py --project "$CSE2E_PROJECT" --output "$COMPOSE" --port-base "$PORT_BASE"
mkdir -p "$EVIDENCE"
compose() { docker compose -f "$COMPOSE" "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  compose logs --no-color event-service venue-service booking-service frontend > "$EVIDENCE/services.log" 2>&1 || true
  compose down > "$EVIDENCE/stop.log" 2>&1 || true
  # The project-scoped volume is intentionally retained, including on failure.
  exit "$result"
}
trap cleanup EXIT
export NUXT_AUTH_MODE=live
npm run build --prefix frontend > "$EVIDENCE/frontend-build.log" 2>&1
compose up -d --build postgres keycloak user-service auth-service event-service venue-service booking-service kong > "$EVIDENCE/stack-start.log" 2>&1
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
node services/event-service/tests/smoke/live.cjs | tee "$EVIDENCE/live-smoke.log"
(cd frontend && npm run test:e2e:report) | tee "$EVIDENCE/browser.log"
compose restart event-service user-service auth-service venue-service booking-service frontend > "$EVIDENCE/restart.log" 2>&1
node services/event-service/tests/smoke/live.cjs --verify-restart | tee "$EVIDENCE/restart-smoke.log"
python3 - "$EVIDENCE/browser/results.json" <<'PYRESULT'
import json, sys
r = json.load(open(sys.argv[1]))
s = r['stats']
assert s['unexpected'] == 0 and s['flaky'] == 0 and s['skipped'] == 0 and s['expected'] > 0, s
print('Browser results:', s)
PYRESULT
