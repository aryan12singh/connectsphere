#!/bin/bash
# Creates one database per service inside the single Postgres instance.
# Keeps local dev simple (one container) while still giving every service
# its own database — no shared schema, no cross-service tables.
set -e

for db in user_db event_db venue_db booking_db attendance_db messaging_db notification_db orchestrator_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db;
EOSQL
done
