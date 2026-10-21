#!/usr/bin/env bash
set -euo pipefail

# Executed by run-seeds.sh after all databases have been seeded. These checks
# guard the cross-service IDs that cannot be protected by a database FK.
assert_count() {
  local database="$1" description="$2" query="$3" expected="$4"
  local actual
  actual="$(psql -v ON_ERROR_STOP=1 -tA -d "$database" -c "$query")"
  if [[ "$actual" != "$expected" ]]; then
    echo "[seed] validation failed: $description (expected $expected, got $actual)" >&2
    exit 1
  fi
  echo "[seed] validated: $description"
}

assert_count event_db "two approved sample requests have Events, coordinators and approval history" \
  "SELECT count(*) FROM event_requests r JOIN events e ON e.\"eventRequestId\" = r.id AND e.\"startAt\" = r.\"startAt\" AND e.\"endAt\" = r.\"endAt\" AND e.status = 'ARRANGEMENT_PENDING' JOIN coordinator_assignments a ON a.\"eventRequestId\" = r.id AND a.\"revokedAt\" IS NULL AND a.\"coordinatorId\" = r.\"currentCoordinatorId\" JOIN activity_log l ON l.\"eventRequestId\" = r.id AND l.action = 'APPROVED' WHERE ((r.id = 'e1000000-0000-4000-8000-000000000008' AND e.id = 'f1000000-0000-4000-8000-000000000008') OR (r.id = 'e1000000-0000-4000-8000-000000000009' AND e.id = 'f1000000-0000-4000-8000-000000000009')) AND r.status = 'APPROVED'" 2

assert_count booking_db "two confirmed sample bookings and confirmation activity records exist" \
  "SELECT count(*) FROM venue_booking_requests b JOIN venue_booking_activity a ON a.\"bookingId\" = b.id AND a.action = 'STATUS_CHANGED' AND a.\"toStatus\" = 'CONFIRMED' WHERE ((b.id = 'b4000000-0000-4000-8000-000000000008' AND b.\"eventId\" = 'f1000000-0000-4000-8000-000000000008' AND b.\"venueId\" = 'b3000000-0000-4000-8000-000000000001' AND b.\"requestedStart\" = '2027-03-16 09:00:00+08' AND b.\"requestedEnd\" = '2027-03-16 17:00:00+08') OR (b.id = 'b4000000-0000-4000-8000-000000000009' AND b.\"eventId\" = 'f1000000-0000-4000-8000-000000000009' AND b.\"venueId\" = 'b3000000-0000-4000-8000-000000000002' AND b.\"requestedStart\" = '2027-03-18 17:00:00+08' AND b.\"requestedEnd\" = '2027-03-18 19:30:00+08')) AND b.status = 'CONFIRMED'" 2
assert_count venue_db "both sample booking venues exist" \
  "SELECT count(*) FROM venues WHERE id IN ('b3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002')" 2

assert_count equipment_db "two pending technical requests have submission history and outbox events" \
  "SELECT count(*) FROM technical_requests r JOIN technical_request_history h ON h.\"requestId\" = r.id AND h.action = 'TechRequestSubmitted' AND h.version = r.version JOIN outbox_events o ON o.\"actionKey\" = 'TechRequestSubmitted:' || r.\"eventRequestId\" || ':v' || r.version WHERE ((r.\"eventRequestId\" = 'e1000000-0000-4000-8000-000000000008' AND r.\"planningEventId\" = 'f1000000-0000-4000-8000-000000000008' AND r.\"coordinatorId\" = 'a1000000-0000-4000-8000-000000000005' AND r.requirements @> '{\"equipment\":[{\"equipmentType\":\"projector\",\"quantity\":1},{\"equipmentType\":\"microphone\",\"quantity\":2}]}'::jsonb) OR (r.\"eventRequestId\" = 'e1000000-0000-4000-8000-000000000009' AND r.\"planningEventId\" = 'f1000000-0000-4000-8000-000000000009' AND r.\"coordinatorId\" = 'a1000000-0000-4000-8000-000000000006' AND r.requirements @> '{\"equipment\":[{\"equipmentType\":\"speaker\",\"quantity\":2},{\"equipmentType\":\"lighting\",\"quantity\":1}]}'::jsonb)) AND r.status = 'PENDING_TECH_REVIEW'" 2

echo "[seed] technical review dependency checks passed"
