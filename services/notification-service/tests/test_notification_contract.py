"""CS-50 HTTP-boundary tests for notification-service.

Runs the real service process (memory mode) with a stand-in for
user-service. Messages go in through POST /internal/messages, the same code
path the RabbitMQ consumer uses. Test IDs follow the PO's sprint test sheet.
"""
import json
import os
import queue
import re
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

INTERNAL_KEY = "contract-internal-key"
# Coordinator names served by the user-service stand-in.
USERS = {"c1": ("Casey", "One"), "c2": ("Charlie", "Two")}
# Active staff per role for /internal/users?role=... (CS-51). vs-old is inactive.
STAFF = {"VENUE_STAFF": [("vs1", True), ("vs2", True), ("vs-old", False)], "TECHNICAL_SUPPORT_STAFF": [("ts1", True)]}
USER_SERVICE_DOWN = {"value": False}


class UserFixture(BaseHTTPRequestHandler):
    def do_GET(self):
        listing = re.fullmatch(r"/internal/users\?role=([A-Z_]+)&page=1", self.path)
        if listing and not USER_SERVICE_DOWN["value"]:
            users = [{"id": uid, "isActive": active} for uid, active in STAFF.get(listing.group(1), [])]
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"users": users, "page": 1, "pageSize": 25, "total": len(users)}).encode())
            return
        match = re.fullmatch(r"/internal/users/([^/]+)", self.path)
        ok = match and match.group(1) in USERS and not USER_SERVICE_DOWN["value"]
        code = 503 if USER_SERVICE_DOWN["value"] else (200 if ok else 404)
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        body = {"id": match.group(1), "firstName": USERS[match.group(1)][0], "lastName": USERS[match.group(1)][1]} if ok else {}
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, *args):
        pass


class NotificationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.users = ThreadingHTTPServer(("127.0.0.1", 0), UserFixture)
        threading.Thread(target=cls.users.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.users.server_close)
        cls.addClassCleanup(cls.users.shutdown)
        env = os.environ.copy()
        env.update({
            "PORT": "0", "NODE_ENV": "test", "DATA_MODE": "memory", "RETRY_DELAY_MS": "0",
            "INTERNAL_API_KEY": INTERNAL_KEY,
            "USER_SERVICE_URL": f"http://127.0.0.1:{cls.users.server_port}",
        })
        cls.process = subprocess.Popen(
            ["node", "src/server.js"], cwd=os.path.join(os.path.dirname(__file__), ".."),
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        cls.addClassCleanup(cls.stop_service)
        lines = queue.Queue()
        threading.Thread(target=lambda: [lines.put(line) for line in cls.process.stdout], daemon=True).start()
        threading.Thread(target=lambda: [None for _ in cls.process.stderr], daemon=True).start()
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            try:
                match = re.search(r"listening on port (\d+)", lines.get(timeout=0.2))
            except queue.Empty:
                continue
            if match:
                cls.port = int(match.group(1))
                return
        raise RuntimeError("notification-service failed to start")

    @classmethod
    def stop_service(cls):
        if cls.process.poll() is None:
            cls.process.terminate()
            cls.process.wait(timeout=5)
        cls.process.stdout.close()
        cls.process.stderr.close()

    # ── helpers ─────────────────────────────────────────────────────────
    def request(self, method, path, body=None, user="o1", role="EVENT_ORGANISER", headers=None):
        all_headers = {"content-type": "application/json", **(headers or {})}
        if user:
            all_headers.update({"x-test-user-id": user, "x-test-role": role})
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urlopen(Request(f"http://127.0.0.1:{self.port}{path}", method=method, headers=all_headers, data=data), timeout=5) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            payload = error.read()
            error.close()
            return error.code, json.loads(payload or b"{}")

    def send(self, message_id, message_type, organiser="o1", **payload):
        message = {"id": message_id, "type": message_type, "aggregateType": "EventRequest", "aggregateId": f"r-{message_id}",
                   "payload": {"eventRequestId": f"r-{message_id}", "organiserId": organiser, "eventName": "Tech Summit",
                               "occurredAt": "2027-01-11T02:00:00.000Z", **payload}}
        return self.request("POST", "/internal/messages", message, user=None, headers={"x-internal-api-key": INTERNAL_KEY})

    def inbox(self, user, role="EVENT_ORGANISER"):
        return self.request("GET", "/notifications", user=user, role=role)[1]["items"]

    # ── TC-CS50-01 ───────────────────────────────────────────────────────
    def test_cs50_01_approval_reaches_the_organiser_inbox(self):
        status, result = self.send("m01", "RequestApproved", organiser="o01", eventId="e01")
        self.assertEqual((status, result["result"]), (200, "processed"))
        items = self.inbox("o01")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["type"], "EVENT_APPROVED")
        self.assertEqual(items[0]["link"], "/events/e01")
        self.assertIn("planning", items[0]["text"].lower())

    # ── TC-CS50-02 ───────────────────────────────────────────────────────
    def test_cs50_02_reassignment_notifies_old_new_coordinator_and_organiser(self):
        self.send("m02", "CoordinatorReassigned", organiser="o02", fromCoordinatorId="c1", coordinatorId="c2")
        self.assertEqual(self.inbox("c1", "EVENT_COORDINATOR")[-1]["type"], "REASSIGNED_AWAY")
        self.assertEqual(self.inbox("c2", "EVENT_COORDINATOR")[-1]["type"], "ASSIGNED_TO_YOU")
        organiser = self.inbox("o02")[-1]
        self.assertEqual(organiser["type"], "COORDINATOR_CHANGED")
        self.assertIn("Charlie Two", organiser["text"])

    # ── TC-CS50-03 (API part; the bell is tested in tests/specs/CS-50.spec.ts) ──
    def test_cs50_03_reading_a_notice_is_saved_and_the_badge_drops(self):
        self.send("m03", "RequestApproved", organiser="o03", eventId="e03")
        self.assertEqual(self.request("GET", "/notifications/summary", user="o03")[1], {"unread": 1, "badge": "1"})
        notice = self.inbox("o03")[0]
        self.assertEqual(self.request("POST", f"/notifications/{notice['id']}/read", {}, user="o03")[0], 204)
        self.assertEqual(self.request("GET", "/notifications/summary", user="o03")[1], {"unread": 0, "badge": ""})
        self.assertIsNotNone(self.request("GET", f"/notifications/{notice['id']}", user="o03")[1]["readAt"])

    # ── TC-CS50-04 ───────────────────────────────────────────────────────
    def test_cs50_04_unrelated_users_cannot_see_someone_elses_notice(self):
        self.send("m04", "RequestApproved", organiser="o04", eventId="e04")
        notice = self.inbox("o04")[0]
        self.assertNotIn("e04", [n.get("eventId") for n in self.inbox("o04-other")])
        self.assertEqual(self.request("GET", f"/notifications/{notice['id']}", user="o04-other")[0], 404)
        self.assertEqual(self.request("POST", f"/notifications/{notice['id']}/read", {}, user="o04-other")[0], 404)
        self.assertEqual(self.request("GET", "/notifications", user=None)[0], 401)

    # ── TC-CS50-05 ───────────────────────────────────────────────────────
    def test_cs50_05_replaying_a_message_does_not_duplicate_the_notice(self):
        self.assertEqual(self.send("M1", "RequestApproved", organiser="o05", eventId="e05")[1]["result"], "processed")
        self.assertEqual(self.send("M1", "RequestApproved", organiser="o05", eventId="e05")[1]["result"], "duplicate")
        self.assertEqual(len([n for n in self.inbox("o05") if n["type"] == "EVENT_APPROVED"]), 1)

    # ── TC-CS50-07 ───────────────────────────────────────────────────────
    def test_cs50_07_badge_caps_at_99_plus(self):
        badges = []
        for count in range(1, 101):
            self.send(f"m07-{count}", "RequestReturned", organiser="o07")
            if count in (98, 99, 100):
                badges.append(self.request("GET", "/notifications/summary", user="o07")[1]["badge"])
        self.assertEqual(badges, ["98", "99", "99+"])

    # ── Retries and the Technical Support failure list (CS-50 AC5) ──────
    def test_cs50_08_failed_delivery_is_retried_then_listed_for_technical_support(self):
        USER_SERVICE_DOWN["value"] = True
        try:
            self.assertEqual(self.send("m08", "CoordinatorAssigned", organiser="o08", coordinatorId="c1")[1]["result"], "failed")
        finally:
            USER_SERVICE_DOWN["value"] = False
        self.assertEqual(self.inbox("o08"), [])
        self.assertEqual(self.request("GET", "/notifications/failures", user="o08")[0], 403)
        status, body = self.request("GET", "/notifications/failures", user="ts1", role="TECHNICAL_SUPPORT_STAFF")
        self.assertEqual(status, 200)
        failed = [item for item in body["items"] if item["messageId"] == "m08"][0]
        self.assertEqual(failed["attempts"], 4)
        self.assertNotIn("text", failed)

    # ── CS-51 (sample messages; producers belong to other stories) ─────────
    def booking_message(self, message_id, message_type, **payload):
        message = {"id": message_id, "type": message_type, "aggregateType": "VenueBooking", "aggregateId": "B1",
                   "payload": {"bookingId": "B1", "venueName": "Hall A", "eventId": "E1", "eventName": "Tech Summit",
                               "coordinatorId": "c51", "organiserId": "o51", **payload}}
        return self.request("POST", "/internal/messages", message, user=None, headers={"x-internal-api-key": INTERNAL_KEY})

    def test_cs51_01_coordinator_told_of_rejection_with_reason(self):
        self.booking_message("m51-01", "BookingDecided", decision="REJECTED", reason="Stage refurbishment")
        notice = self.inbox("c51", "EVENT_COORDINATOR")[-1]
        self.assertEqual(notice["type"], "VENUE_REJECTED")
        self.assertIn("Stage refurbishment", notice["text"])

    def test_cs51_03_all_active_venue_staff_get_new_booking_request(self):
        self.booking_message("m51-03", "BookingRequested")
        for staff_id in ("vs1", "vs2"):
            self.assertIn("New booking request", self.inbox(staff_id, "VENUE_STAFF")[-1]["text"])
        self.assertEqual(self.inbox("vs-old", "VENUE_STAFF"), [], "inactive staff are skipped")

    def test_cs51_04_organiser_gets_no_internal_notices(self):
        self.booking_message("m51-04a", "VenueUnavailable", reason="Maintenance", organiserId="o51-04", coordinatorId="c51-04")
        self.booking_message("m51-04b", "BufferConflictFlagged", organiserId="o51-04", coordinatorId="c51-04")
        items = self.inbox("o51-04")
        self.assertEqual([n for n in items if n["type"] in ("VENUE_UNAVAILABLE", "BUFFER_CONFLICT")], [])
        self.assertNotIn("Maintenance", " ".join(n["text"] for n in items))

    def test_cs51_06_safety_change_alerts_only_the_affected_area(self):
        self.booking_message("m51-06", "SafetyChangesRequested", areas=["EQUIPMENT"], comment="Cable run blocks exit", coordinatorId="c51-06")
        self.assertEqual(len(self.inbox("ts1", "TECHNICAL_SUPPORT_STAFF")), 1)
        self.assertEqual(len(self.inbox("c51-06", "EVENT_COORDINATOR")), 1)
        self.assertEqual([n for n in self.inbox("vs1", "VENUE_STAFF") if n["type"] == "SAFETY_CHANGES_REQUESTED"], [])

    def test_cs50_12_internal_endpoint_needs_the_internal_key(self):
        status, _ = self.request("POST", "/internal/messages", {"id": "x", "type": "RequestApproved", "payload": {}}, user="o1")
        self.assertEqual(status, 403)
        status, _ = self.request("POST", "/internal/messages", {"id": "x"}, user=None, headers={"x-internal-api-key": INTERNAL_KEY})
        self.assertEqual(status, 422)


if __name__ == "__main__":
    unittest.main()
