import json
import os
import queue
import re
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class FakeBookingLinkHandler(BaseHTTPRequestHandler):
    blocking_ids = set()
    unavailable = False

    def do_GET(self):
        if self.unavailable:
            self.send_response(503)
            self.end_headers()
            return
        venue_id = urlparse(self.path).path.rstrip('/').split('/')[-1]
        payload = {
            "venueId": venue_id,
            "blockingCount": 1 if venue_id in self.blocking_ids else 0,
            "statuses": ["TENTATIVELY_HELD", "CONFIRMED"],
        }
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args):
        return


class VenueServiceContractTest(unittest.TestCase):
    """HTTP-boundary tests for venue-service requirements.

    JavaScript unit tests cover pure validation. These tests intentionally
    cover only the observable HTTP contract: response shape, authorization,
    and persistence across requests.
    """

    @classmethod
    def setUpClass(cls):
        cls.port = int(os.environ.get("VENUE_TEST_PORT", "0"))
        cls.booking_server = HTTPServer(("127.0.0.1", 0), FakeBookingLinkHandler)
        cls.booking_thread = threading.Thread(target=cls.booking_server.serve_forever, daemon=True)
        cls.booking_thread.start()
        cls.addClassCleanup(cls.stop_booking_server)
        env = os.environ.copy()
        env.update({
            "PORT": str(cls.port), "NODE_ENV": "test", "DATA_MODE": "memory",
            "BOOKING_SERVICE_URL": f"http://127.0.0.1:{cls.booking_server.server_port}",
        })
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
                match = re.search(r"venue-service listening on port (\d+)", line)
                if not match:
                    continue
                cls.port = int(match.group(1))
                listening = cls.port > 0
            if listening:
                try:
                    with urlopen(f"http://127.0.0.1:{cls.port}/health", timeout=0.2) as response:
                        if response.status == 200 and json.load(response) == {"status": "ok", "service": "venue-service"}:
                            return
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)
        cls.stop_service()
        raise RuntimeError(f"venue-service failed to start (exit {cls.process.returncode}): {cls.output}")

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

    @classmethod
    def stop_booking_server(cls):
        cls.booking_server.shutdown()
        cls.booking_thread.join(timeout=5)
        cls.booking_server.server_close()

    def request(self, method, path, body=None, role="VENUE_STAFF", user_id="venue-1"):
        headers = {
            "content-type": "application/json",
            "x-test-user-id": user_id,
            "x-test-role": role,
        }
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

    def venue_payload(self, **overrides):
        return {
            "name": "Marina Convention Centre",
            "address": "18 Bayfront Link",
            "capacity": 200,
            "venueType": "PHYSICAL",
            "supportedLayouts": ["THEATRE", "CLASSROOM", "CABARET"],
            "facilities": ["PROJECTOR", "PA_SYSTEM"],
            "accessibilityTags": ["WHEELCHAIR_ACCESS"],
            "operatingHours": [{"weekday": "MONDAY", "isClosed": False, "opensAt": "09:00", "closesAt": "18:00"}],
            "timeZone": "Asia/Singapore", "reason": "Initial venue setup",
            "managedById": "venue-1",
            **overrides,
        }

    def test_create_venue_returns_the_captured_fields(self):
        status, body = self.request("POST", "/venues", self.venue_payload())
        self.assertEqual(status, 201)
        self.assertEqual(body["name"], "Marina Convention Centre")
        self.assertEqual(body["capacity"], 200)
        self.assertEqual(body["venueType"], "PHYSICAL")
        self.assertEqual(body["supportedLayouts"], ["THEATRE", "CLASSROOM", "CABARET"])
        self.assertEqual(body["facilities"], ["PROJECTOR", "PA_SYSTEM"])
        self.assertEqual(body["accessibilityTags"], ["WHEELCHAIR_ACCESS"])

    def test_any_venue_staff_can_replace_a_venue_over_http(self):
        status, venue = self.request("POST", "/venues", self.venue_payload(
            name="SMU Hall", address="Bras Basah", capacity=100,
            supportedLayouts=["THEATRE"], facilities=[], accessibilityTags=[],
            managedById="venue-manager", reason="Venue created",
        ), user_id="venue-manager")
        self.assertEqual(status, 201)
        status, updated = self.request("PUT", f"/venues/{venue['id']}", {
            **venue, "capacity": 150, "reason": "Capacity updated",
        }, user_id="other-venue-staff")
        self.assertEqual(status, 200)
        self.assertEqual(updated["capacity"], 150)

    def test_options_expose_the_controlled_form_values(self):
        status, body = self.request("GET", "/venues/options")
        self.assertEqual(status, 200)
        self.assertIn({"value": "THEATRE", "label": "Theatre"}, body["supportedLayouts"])
        self.assertIn({"value": "PHYSICAL", "label": "Physical"}, body["venueTypes"])

    def test_event_organiser_cannot_view_venues_without_auth_service_permission(self):
        status, body = self.request("GET", "/venues/options", role="EVENT_ORGANISER", user_id="organiser-1")
        self.assertEqual(status, 403)
        self.assertIn("permission", body["error"].lower())

    def test_technical_support_cannot_manage_venues_without_auth_service_permission(self):
        status, body = self.request(
            "POST", "/venues", self.venue_payload(),
            role="TECHNICAL_SUPPORT_STAFF", user_id="support-1",
        )
        self.assertEqual(status, 403)
        self.assertIn("permission", body["error"].lower())

    def test_capacity_above_ten_thousand_is_rejected_without_persistence(self):
        status, body = self.request("POST", "/venues", self.venue_payload(capacity=10001))
        self.assertEqual(status, 422)
        self.assertIn("capacity", body["error"]["fields"])

    def test_any_venue_type_can_be_deleted_when_no_blocking_booking_exists(self):
        payload = self.venue_payload(venueType="VIRTUAL")
        payload.pop("address")
        payload.pop("capacity")
        status, venue = self.request("POST", "/venues", payload)
        self.assertEqual(status, 201)
        status, body = self.request("DELETE", f"/venues/{venue['id']}")
        self.assertEqual(status, 204)
        self.assertEqual(body, {})
        status, _ = self.request("GET", f"/venues/{venue['id']}")
        self.assertEqual(status, 404)

    def test_delete_is_rejected_when_current_or_future_booking_blocks_the_venue(self):
        status, venue = self.request("POST", "/venues", self.venue_payload())
        self.assertEqual(status, 201)
        FakeBookingLinkHandler.blocking_ids.add(venue["id"])
        try:
            status, body = self.request("DELETE", f"/venues/{venue['id']}")
            self.assertEqual(status, 409)
            self.assertEqual(body["error"]["code"], "VENUE_HAS_BLOCKING_BOOKINGS")
            self.assertEqual(body["blockingCount"], 1)
            status, _ = self.request("GET", f"/venues/{venue['id']}")
            self.assertEqual(status, 200)
        finally:
            FakeBookingLinkHandler.blocking_ids.discard(venue["id"])

    def test_event_coordinator_cannot_delete_a_venue(self):
        status, venue = self.request("POST", "/venues", self.venue_payload())
        self.assertEqual(status, 201)
        status, body = self.request(
            "DELETE", f"/venues/{venue['id']}", role="EVENT_COORDINATOR", user_id="coordinator-1",
        )
        self.assertEqual(status, 403)
        self.assertIn("permission", body["error"].lower())

    def test_delete_fails_closed_when_booking_lookup_is_unavailable(self):
        status, venue = self.request("POST", "/venues", self.venue_payload())
        self.assertEqual(status, 201)
        FakeBookingLinkHandler.unavailable = True
        try:
            status, body = self.request("DELETE", f"/venues/{venue['id']}")
            self.assertEqual(status, 503)
            self.assertEqual(body["error"]["code"], "BOOKING_SERVICE_UNAVAILABLE")
        finally:
            FakeBookingLinkHandler.unavailable = False
        status, _ = self.request("GET", f"/venues/{venue['id']}")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
