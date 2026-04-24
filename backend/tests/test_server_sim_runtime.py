"""HTTP contract for `/api/scheduler/sim_runtime` (play/pause only)."""

from __future__ import annotations

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from server import app  # noqa: E402  # starts BLE; integration-style


class SimRuntimeApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_stopped_rejected(self):
        res = self.client.post(
            "/api/scheduler/sim_runtime",
            json={"runtime": "stopped"},
        )
        self.assertEqual(res.status_code, 400)
        data = res.get_json() or {}
        self.assertFalse(data.get("ok"))

    def test_running_and_paused_accepted(self):
        r0 = self.client.post("/api/scheduler/mode", json={"mode": "DUMMY"})
        self.assertEqual(r0.status_code, 200)
        for rt in ("running", "paused"):
            with self.subTest(rt=rt):
                res = self.client.post(
                    "/api/scheduler/sim_runtime",
                    json={"runtime": rt},
                )
                self.assertEqual(res.status_code, 200, msg=res.get_data(as_text=True))
                data = res.get_json() or {}
                self.assertTrue(data.get("ok"))

    def test_sim_runtime_rejected_outside_dummy_mode(self):
        """Play/Pause only applies in DUMMY. Frontend switches away
        from DUMMY -> any stray runtime POST must 400, not silently
        flip backend runtime."""
        r0 = self.client.post("/api/scheduler/mode", json={"mode": "SIM"})
        self.assertEqual(r0.status_code, 200)
        res = self.client.post(
            "/api/scheduler/sim_runtime",
            json={"runtime": "running"},
        )
        self.assertEqual(res.status_code, 400)
        data = res.get_json() or {}
        self.assertFalse(data.get("ok"))
        self.assertIn("DUMMY", data.get("error", ""))


if __name__ == "__main__":
    unittest.main()
