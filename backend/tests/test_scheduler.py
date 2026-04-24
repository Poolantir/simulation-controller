"""
Integration tests for the Dummy Mode scheduler.

Uses a seeded RNG and short durations (monkey-patched via module-level
tweaks) to keep the full lifecycle deterministic and fast.
"""

from __future__ import annotations

import os
import random
import sys
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

import scheduler as scheduler_module  # noqa: E402
from scheduler import (  # noqa: E402
    MODE_DUMMY,
    MODE_SIM,
    Scheduler,
)


MACLEAN = ["stall", "stall", "stall", "urinal", "urinal", "urinal"]
SEAMEN = ["stall", "stall", "nonexistent", "urinal", "urinal", "nonexistent"]


def _wait_until(pred, timeout=2.0, interval=0.02):
    """Spin until `pred()` returns truthy, or timeout."""
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(interval)
    return False


class SchedulerLifecycleTests(unittest.TestCase):
    def setUp(self):
        # Short durations so tests run quickly; tick interval stays at
        # the default (0.1s) to verify the production loop behaviour.
        self._orig_pee = scheduler_module.PEE_DURATION_RANGE_S
        self._orig_poo = scheduler_module.POO_DURATION_RANGE_S
        scheduler_module.PEE_DURATION_RANGE_S = (0.1, 0.15)
        scheduler_module.POO_DURATION_RANGE_S = (0.2, 0.25)

        self.events = []
        self.sched = Scheduler(rng=random.Random(1234))
        self.sched.subscribe(lambda ev, data: self.events.append((ev, data)))
        self.sched.set_mode(MODE_DUMMY)
        self.sched.set_config(
            toilet_types=MACLEAN,
            shy_peer_pct=50.0,
            middle_toilet_first_choice_pct=2.0,
        )
        self.sched.start()

    def tearDown(self):
        self.sched.stop()
        scheduler_module.PEE_DURATION_RANGE_S = self._orig_pee
        scheduler_module.POO_DURATION_RANGE_S = self._orig_poo

    # -- primitive behaviours -----------------------------------------

    def test_fifo_assignment(self):
        self.sched.enqueue("pee")
        self.sched.enqueue("poo")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_started" for ev, _ in self.events
                )
            )
        )
        starts = [d for ev, d in self.events if ev == "assignment_started"]
        self.assertGreaterEqual(len(starts), 1)
        # First assigned event is for the first-enqueued user (id=1).
        self.assertEqual(starts[0]["queue_item_id"], 1)

    def test_duration_in_range(self):
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_started" for ev, _ in self.events
                )
            )
        )
        start = next(d for ev, d in self.events if ev == "assignment_started")
        self.assertGreaterEqual(start["duration_s"], 0.1)
        self.assertLessEqual(start["duration_s"], 0.15)

    def test_complete_releases_fixture(self):
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_completed" for ev, _ in self.events
                ),
                timeout=2.0,
            )
        )
        snap = self.sched.snapshot()
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))
        self.assertEqual(snap["satisfied_users"], 1)

    # -- policy behaviours --------------------------------------------

    def test_poo_never_assigned_to_urinal(self):
        for _ in range(8):
            self.sched.enqueue("poo")
        self.assertTrue(
            _wait_until(
                lambda: sum(
                    1 for ev, _ in self.events if ev == "assignment_started"
                )
                >= 3,
                timeout=2.0,
            )
        )
        for ev, data in self.events:
            if ev == "assignment_started":
                self.assertEqual(
                    data["fixture_kind"],
                    "stall",
                    msg=f"poo was assigned to {data['fixture_kind']}",
                )

    def test_nonexistent_fixtures_never_assigned(self):
        self.sched.set_config(toilet_types=SEAMEN)
        for _ in range(6):
            self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: sum(
                    1 for ev, _ in self.events if ev == "assignment_started"
                )
                >= 2,
                timeout=2.0,
            )
        )
        for ev, data in self.events:
            if ev == "assignment_started":
                # Global ids 3 and 6 are nonexistent in SEAMEN.
                self.assertNotIn(data["fixture_id"], (3, 6))

    def test_out_of_order_fixture_never_assigned(self):
        self.sched.set_config(
            restroom_conditions={
                "stalls": [
                    {"id": 1, "condition": "Out-of-Order"},
                    {"id": 2, "condition": "Clean"},
                    {"id": 3, "condition": "Clean"},
                ],
                "urinals": [
                    {"id": 4, "condition": "Out-of-Order"},
                    {"id": 5, "condition": "Out-of-Order"},
                    {"id": 6, "condition": "Out-of-Order"},
                ],
            }
        )
        for _ in range(4):
            self.sched.enqueue("poo")
        self.assertTrue(
            _wait_until(
                lambda: sum(
                    1 for ev, _ in self.events if ev == "assignment_started"
                )
                >= 2,
                timeout=2.0,
            )
        )
        for ev, data in self.events:
            if ev == "assignment_started":
                self.assertIn(data["fixture_id"], (2, 3))

    def test_reset_clears_queue_and_occupancy(self):
        for _ in range(3):
            self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_started" for ev, _ in self.events
                )
            )
        )
        self.sched.reset()
        snap = self.sched.snapshot()
        self.assertEqual(snap["queue"], [])
        self.assertEqual(snap["satisfied_users"], 0)
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))

    def test_mode_switch_away_from_dummy_clears_state(self):
        self.sched.enqueue("pee")
        self.sched.enqueue("pee")
        self.sched.set_mode(MODE_SIM)
        snap = self.sched.snapshot()
        self.assertEqual(snap["mode"], MODE_SIM)
        self.assertEqual(snap["queue"], [])
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))


if __name__ == "__main__":
    unittest.main()
