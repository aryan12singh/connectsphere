import json
import os
import subprocess
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class EventServiceContractTest(unittest.TestCase):
    """Process-boundary checks for the OpenAPI request lifecycle."""

    @classmethod
    def setUpClass(cls):
        cls.port = int(os.environ.get('EVENT_TEST_PORT', '43103'))
        env = os.environ.copy()
        env.update({'PORT': str(cls.port), 'NODE_ENV': 'test', 'DATA_MODE': 'memory', 'AUTH_MODE': 'mock'})
        cls.process = subprocess.Popen(['node', 'src/server.js'], cwd=os.path.join(os.path.dirname(__file__), '..'), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                with urlopen(f'http://127.0.0.1:{cls.port}/health', timeout=0.2):
                    return
            except Exception:
                time.sleep(0.1)
        stdout, stderr = cls.process.communicate(timeout=1)
        raise RuntimeError(f'event-service failed to start: {stdout!r} {stderr!r}')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

    def request(self, method, path, body=None, role='EVENT_ORGANISER', user_id='organiser-contract', key=None):
        headers = {'content-type': 'application/json', 'x-test-user-id': user_id, 'x-test-role': role}
        if key:
            headers['Idempotency-Key'] = key
        data = json.dumps(body).encode() if body is not None else None
        try:
            response = urlopen(Request(f'http://127.0.0.1:{self.port}{path}', method=method, headers=headers, data=data), timeout=3)
            return response.status, json.loads(response.read() or b'{}')
        except HTTPError as error:
            payload = error.read(); error.close()
            return error.code, json.loads(payload or b'{}')

    def payload(self):
        return {
            'eventName': 'Contract summit', 'purpose': 'Testing',
            'startAt': '2026-11-20T09:00:00+08:00', 'endAt': '2026-11-20T17:00:00+08:00',
            'timeZone': 'Asia/Singapore', 'expectedAttendance': 100, 'minimumCapacity': 100,
            'venueType': 'Convention centre', 'accessibilityNeeds': [], 'equipmentNeeds': [],
        }

    def test_create_is_idempotent_and_submit_requires_version(self):
        status, first = self.request('POST', '/event-requests', self.payload(), key='event-contract-1')
        self.assertEqual(status, 201); self.assertEqual(first['status'], 'DRAFT')
        status, replay = self.request('POST', '/event-requests', self.payload(), key='event-contract-1')
        self.assertEqual(status, 201); self.assertEqual(replay['id'], first['id'])
        status, error = self.request('POST', f"/event-requests/{first['id']}/submit", {}, key='event-submit-1')
        self.assertEqual(status, 422); self.assertEqual(error['error']['code'], 'VALIDATION_FAILED')

    def test_wrong_permission_is_rejected(self):
        status, body = self.request('POST', '/event-requests', self.payload(), role='EVENT_COORDINATOR', user_id='coord-contract')
        self.assertEqual(status, 403); self.assertEqual(body['error']['code'], 'FORBIDDEN')


if __name__ == '__main__':
    unittest.main()
