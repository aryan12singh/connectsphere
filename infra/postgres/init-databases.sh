#!/bin/bash
# Creates one database per service inside the single Postgres instance,
# plus keycloak_db, where Keycloak keeps its users and realm settings.
# Runs only the FIRST time the postgres volume is created. If your volume
# already exists, create auth_db by hand instead (see docs/dev-log.md).
set -e

for db in user_db auth_db event_db venue_db booking_db attendance_db messaging_db notification_db orchestrator_db keycloak_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db;
EOSQL
done
