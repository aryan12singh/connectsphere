#!/bin/bash
# One-shot seed loader (compose service "seed").
#
# Each service applies its own migrations when it starts (prisma migrate
# deploy), so this script first WAITS until the tables exist, then loads the
# seed file. Seeds are idempotent (ON CONFLICT DO NOTHING / safe UPDATEs), so
# running it again is harmless.
#
# Order matters only for readability: services never read each other's
# databases, ids just line up (user ids in event_db / venue_db seeds).
set -euo pipefail

SEEDS=/seed/services
# database | table that proves the migration ran | seed file
LIST=(
  "user_db|organisations|$SEEDS/user-service/prisma/seed/01_user_db.sql"
  "auth_db|sessions|$SEEDS/auth-service/prisma/seed/02_auth_db.sql"
  "venue_db|venue_operating_hours|/seed/backend/03_venue_db.sql"
  "booking_db|venue_booking_requests|/seed/backend/04_booking_db.sql"
  "event_db|activity_log|$SEEDS/event-service/prisma/seed/04_event_db.sql"
)

for entry in "${LIST[@]}"; do
  IFS='|' read -r db table file <<<"$entry"
  echo "[seed] waiting for $db.$table ..."
  for i in $(seq 1 90); do
    if [ "$(psql -d "$db" -tAc "select to_regclass('public.$table') is not null" 2>/dev/null || true)" = "t" ]; then break; fi
    sleep 2
    if [ "$i" = 90 ]; then echo "[seed] TIMEOUT: $db.$table never appeared (did the service migrate?)"; exit 1; fi
  done
  echo "[seed] loading $(basename "$file") into $db"
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$file"
done
echo "[seed] done"
