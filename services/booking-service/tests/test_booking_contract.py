import json
import os
import queue
import re
import subprocess
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PERSISTED_STATUSES = [
    "AVAILABLE", "TENTATIVELY_HELD", "CONFIRMED", "BLOCKED",
    "UNAVAILABLE", "REJECTED", "CANCELLED",
]


class BookingServiceContractTest(unittest.TestCase):
    """HTTP-boundary tests for booking-service requirements.

    JavaScript unit tests cover pure policy/validation. These tests keep the
    real process boundary for authentication, persistence, ownership,
    idempotency, status transitions, and activity history.
    """

    @classmethod
    def setUpClass(cls):
        cls.port = int(os.environ.get("BOOKING_TEST_PORT", "0"))
        env = os.environ.copy()
        env.update({"PORT": str(cls.port), "NODE_ENV": "test", "DATA_MODE": "memory"})
        cls.process = subprocess.Popen(
            ["node", "src/server.js"],
            cwd=os.path.join(os.path.dirname(__file__), ".."),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        cls.addClassCleanup(cls.stop_service)
        cls.output = {"stdout": [], "stderr": []}
        ready = queue.Queue()

        def read_output(stream, name):
            for line in stream:
                cls.output[name].append(line.rstrip())
                if name == "stdout":
                    ready.put(line)

        cls.readers = [threading.Thread(target=read_output, args=(stream, name), daemon=True)
                       for stream, name in [(cls.process.stdout, "stdout"), (cls.process.stderr, "stderr")]]
        for reader in cls.readers:
            reader.start()
        deadline = time.monotonic() + 8
        listening = False
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                break
            if not listening:
                try:
                    line = ready.get(timeout=0.1)
                except queue.Empty:
                    continue
                match = re.search(r"booking-service listening on port (\d+)", line)
                if not match:
                    continue
                cls.port = int(match.group(1))
                listening = cls.port > 0
            if listening:
                try:
                    with urlopen(f"http://127.0.0.1:{cls.port}/health", timeout=0.2) as response:
                        if response.status == 200 and json.load(response) == {"status": "ok", "service": "booking-service"}:
                            return
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)
        cls.stop_service()
        raise RuntimeError(f"booking-service failed to start (exit {cls.process.returncode}): {cls.output}")

    @classmethod
    def stop_service(cls):
        if cls.process.poll() is None:
            cls.process.terminate()
            try:
                cls.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.process.kill()
                cls.process.wait(timeout=5)
        for reader in cls.readers:
            reader.join(timeout=1)
        cls.process.stdout.close()
        cls.process.stderr.close()

    def request(self, method, path, body=None, role="EVENT_COORDINATOR", user_id="coordinator-1", key=None):
        headers = {
            "content-type": "application/json",
            "x-test-user-id": user_id,
            "x-test-role": role,
        }
        if key:
            headers["idempotency-key"] = key
        data = json.dumps(body).encode() if body is not None else None
        try:
            response = urlopen(
                Request(f"http://127.0.0.1:{self.port}{path}", method=method, headers=headers, data=data),
                timeout=3,
            )
            return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            payload = error.read()
            error.close()
            return error.code, json.loads(payload or b"{}")

    def valid_payload(self):
        return {
            "eventId": "event-1",
            "venueId": "venue-1",
            "title": "Autumn Product Summit",
            "reason": "Customer conference",
            "startAt": "2026-11-20T01:00:00.000Z",
            "endAt": "2026-11-20T09:00:00.000Z",
            "timeZone": "Asia/Singapore",
        }

    def create_booking(self, key, role="EVENT_COORDINATOR", user_id="coordinator-1", **overrides):
        status, body = self.request(
            "POST", "/venue-bookings", {**self.valid_payload(), **overrides},
            role=role, user_id=user_id, key=key,
        )
        self.assertEqual(status, 201)
        return body

    def test_coordinator_allowed_creation_status_is_persisted_without_normalisation(self):
        body = self.create_booking("booking-1", status="CANCELLED")
        self.assertEqual(body["status"], "CANCELLED")
        self.assertEqual(body["title"], "Autumn Product Summit")
        self.assertEqual(body["reason"], "Customer conference")

    def test_coordinator_disallowed_creation_status_is_rejected_without_normalisation(self):
        status, body = self.request(
            "POST", "/venue-bookings", {**self.valid_payload(), "status": "CONFIRMED"},
            key="booking-disallowed-status",
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"]["code"], "STATUS_NOT_PERMITTED")

    def test_venue_staff_cannot_create_without_auth_service_create_permission(self):
        status, body = self.request(
            "POST", "/venue-bookings", {**self.valid_payload(), "status": "CONFIRMED"},
            role="VENUE_STAFF", user_id="staff-create", key="booking-staff-create",
        )
        self.assertEqual(status, 403)
        self.assertNotIn("id", body)

    def test_venue_staff_can_create_operational_blocks_without_booking_create_permission(self):
        for state in ["BLOCKED", "UNAVAILABLE"]:
            with self.subTest(status=state):
                payload = {**self.valid_payload(), "eventId": None, "status": state,
                           "reason": "Maintenance window"}
                key = f"staff-operational-{state}"
                status, block = self.request("POST", "/venue-bookings", payload,
                    role="VENUE_STAFF", user_id="staff-operations", key=key)
                self.assertEqual(status, 201)
                self.assertEqual(block["status"], state)
                replay_status, replay = self.request("POST", "/venue-bookings", payload,
                    role="VENUE_STAFF", user_id="staff-operations", key=key)
                self.assertEqual(replay_status, 200)
                self.assertEqual(replay["id"], block["id"])

    def test_staff_decision_permission_does_not_create_ordinary_bookings_or_history(self):
        _, before = self.request("GET", "/venue-bookings/history?venueId=venue-permission",
                                 role="VENUE_STAFF", user_id="staff-permission")
        for state in [None, "AVAILABLE", "TENTATIVELY_HELD", "CONFIRMED", "REJECTED", "CANCELLED"]:
            with self.subTest(status=state):
                payload = {**self.valid_payload(), "venueId": "venue-permission"}
                if state is not None:
                    payload["status"] = state
                status, result = self.request("POST", "/venue-bookings", payload,
                    role="VENUE_STAFF", user_id="staff-permission", key=f"staff-denied-{state}")
                self.assertEqual(status, 403)
                self.assertNotIn("id", result)
        _, after = self.request("GET", "/venue-bookings/history?venueId=venue-permission",
                                role="VENUE_STAFF", user_id="staff-permission")
        self.assertEqual(after["items"], before["items"])

    def test_submission_without_reason_returns_field_level_validation(self):
        payload = self.valid_payload()
        del payload["reason"]
        status, body = self.request("POST", "/venue-bookings", payload, key="booking-2")
        self.assertEqual(status, 422)
        self.assertIn("reason", body.get("error", {}).get("fields", {}))

    def test_coordinator_can_cancel_their_own_tentative_booking(self):
        booking = self.create_booking("booking-3")
        status, updated = self.request("PUT", f"/venue-bookings/{booking['id']}", {
            **booking, "status": "CANCELLED", "reason": "Date changed",
        })
        self.assertEqual(status, 200)
        self.assertEqual(updated["status"], "CANCELLED")

    def test_venue_staff_can_replace_a_booking_with_any_persisted_status(self):
        booking = self.create_booking("booking-4")
        for next_status in PERSISTED_STATUSES:
            status, booking = self.request("PUT", f"/venue-bookings/{booking['id']}", {
                **booking, "status": next_status, "reason": f"Set to {next_status}",
            }, role="VENUE_STAFF", user_id="staff-1")
            self.assertEqual(status, 200)
            self.assertEqual(booking["status"], next_status)

    def test_repeating_a_submission_returns_the_original_booking(self):
        first_status, first = self.request("POST", "/venue-bookings", self.valid_payload(), key="booking-5")
        second_status, second = self.request("POST", "/venue-bookings", self.valid_payload(), key="booking-5")
        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 200)
        self.assertEqual(first["id"], second["id"])

    def test_reusing_a_key_with_a_different_payload_is_rejected(self):
        first_status, _ = self.request("POST", "/venue-bookings", self.valid_payload(), key="booking-reuse")
        changed = self.valid_payload()
        changed["title"] = "Different event"
        second_status, body = self.request("POST", "/venue-bookings", changed, key="booking-reuse")
        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 409)
        self.assertEqual(body["error"]["code"], "IDEMPOTENCY_KEY_REUSE")

    def test_history_records_both_coordinator_and_staff_actors(self):
        booking = self.create_booking("booking-6")
        status, _ = self.request("PUT", f"/venue-bookings/{booking['id']}", {
            **booking, "status": "CONFIRMED", "reason": "Approved by venue staff",
        }, role="VENUE_STAFF", user_id="staff-2")
        self.assertEqual(status, 200)
        status, history = self.request("GET", "/venue-bookings/history?venueId=venue-1", role="VENUE_STAFF", user_id="staff-2")
        self.assertEqual(status, 200)
        roles = {item["actorRole"] for item in history["items"]}
        self.assertIn("EVENT_COORDINATOR", roles)
        self.assertIn("VENUE_STAFF", roles)

    def test_coordinator_cannot_read_another_organisers_booking(self):
        booking = self.create_booking("booking-owner")
        status, body = self.request(
            "GET", f"/venue-bookings/{booking['id']}",
            user_id="different-coordinator",
        )
        self.assertEqual(status, 403)
        self.assertNotIn("title", body)

    def test_users_without_booking_permissions_cannot_read_booking_routes(self):
        status, body = self.request(
            "GET", "/venue-bookings", role="TECHNICAL_SUPPORT_STAFF", user_id="support-1",
        )
        self.assertEqual(status, 403)
        self.assertIn("permission", body["error"].lower())

    def test_internal_venue_link_lookup_requires_private_service_header(self):
        booking = self.create_booking(
            "booking-internal-links", venueId="venue-links",
            startAt="2026-12-20T01:00:00.000Z", endAt="2026-12-20T02:00:00.000Z",
        )
        status, booking = self.request(
            "PUT", f"/venue-bookings/{booking['id']}",
            {**booking, "status": "CONFIRMED", "reason": "Confirmed for internal lookup"},
            role="VENUE_STAFF", user_id="staff-links",
        )
        self.assertEqual(status, 200)
        self.assertEqual(booking["venueId"], "venue-links")

        with self.assertRaises(HTTPError) as context:
            urlopen(Request(f"http://127.0.0.1:{self.port}/internal/venue-links/venue-links"), timeout=3)
        self.assertEqual(context.exception.code, 403)
        context.exception.close()

        response = urlopen(Request(
            f"http://127.0.0.1:{self.port}/internal/venue-links/venue-links",
            headers={"x-internal-api-key": "change-me-dev-internal-key"},
        ), timeout=3)
        body = json.loads(response.read())
        self.assertEqual(body["blockingCount"], 1)
        self.assertEqual(body["statuses"], ["TENTATIVELY_HELD", "CONFIRMED"])


if __name__ == "__main__":
    unittest.main()
