import json
import os
import subprocess
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class VenueServiceContractTest(unittest.TestCase):
    """HTTP-boundary tests for venue-service requirements.

    JavaScript unit tests cover pure validation. These tests intentionally
    cover only the observable HTTP contract: response shape, authorization,
    and persistence across requests.
    """

    @classmethod
    def setUpClass(cls):
        cls.port = int(os.environ.get("VENUE_TEST_PORT", "43101"))
        env = os.environ.copy()
        env.update({"PORT": str(cls.port), "NODE_ENV": "test", "DATA_MODE": "memory"})
        cls.process = subprocess.Popen(
            ["node", "src/server.js"],
            cwd=os.path.join(os.path.dirname(__file__), ".."),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                with urlopen(f"http://127.0.0.1:{cls.port}/health", timeout=0.2):
                    return
            except Exception:
                time.sleep(0.1)
        stdout, stderr = cls.process.communicate(timeout=1)
        raise RuntimeError(f"venue-service failed to start: {stdout!r} {stderr!r}")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

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


if __name__ == "__main__":
    unittest.main()
