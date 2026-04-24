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
    API_SIM_USER_RUNTIMES,
    MODE_DUMMY,
    MODE_SIM,
    RUNTIME_PAUSED,
    RUNTIME_RUNNING,
    RUNTIME_STOPPED,
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
        # The preview window is also shortened so tests don't spend
        # 3s idling per enqueue, but it's deliberately still longer
        # than a tick so the reservation->commit transition is observable.
        self._orig_pee = scheduler_module.PEE_DURATION_RANGE_S
        self._orig_poo = scheduler_module.POO_DURATION_RANGE_S
        self._orig_preview = scheduler_module.PREVIEW_DURATION_S
        scheduler_module.PEE_DURATION_RANGE_S = (0.1, 0.15)
        scheduler_module.POO_DURATION_RANGE_S = (0.2, 0.25)
        scheduler_module.PREVIEW_DURATION_S = 0.15

        self.events = []
        self.sched = Scheduler(rng=random.Random(1234))
        self.sched.subscribe(lambda ev, data: self.events.append((ev, data)))
        self.sched.set_mode(MODE_DUMMY)
        self.sched.set_config(
            toilet_types=MACLEAN,
            shy_peer_pct=50.0,
            middle_toilet_first_choice_pct=2.0,
        )
        self.sched.set_sim_runtime(RUNTIME_RUNNING)
        self.sched.start()

    def tearDown(self):
        self.sched.stop()
        scheduler_module.PEE_DURATION_RANGE_S = self._orig_pee
        scheduler_module.POO_DURATION_RANGE_S = self._orig_poo
        scheduler_module.PREVIEW_DURATION_S = self._orig_preview

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

    def test_preview_precedes_assignment_started(self):
        """Every assignment must be preceded by an `assignment_preview`
        event for the same (queue_item_id, fixture_id) pair, and the
        `in_use` flag stays False during the preview window."""
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_preview" for ev, _ in self.events
                )
            )
        )
        preview = next(d for ev, d in self.events if ev == "assignment_preview")
        # During the preview window, the chosen fixture is reserved
        # but NOT in_use.
        snap = self.sched.snapshot()
        reserved = [f for f in snap["fixtures"] if f["reserved"]]
        self.assertEqual(len(reserved), 1)
        self.assertEqual(reserved[0]["id"], preview["fixture_id"])
        self.assertFalse(reserved[0]["in_use"])
        # Queue item is still in the queue during preview (not popped
        # until commit).
        self.assertEqual(len(snap["queue"]), 1)
        self.assertEqual(snap["queue"][0]["id"], preview["queue_item_id"])

        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_started" for ev, _ in self.events
                ),
                timeout=1.5,
            )
        )
        started = next(
            d for ev, d in self.events if ev == "assignment_started"
        )
        self.assertEqual(started["fixture_id"], preview["fixture_id"])
        self.assertEqual(started["queue_item_id"], preview["queue_item_id"])
        # Ordering: preview event strictly precedes started event.
        preview_idx = next(
            i for i, (ev, _) in enumerate(self.events) if ev == "assignment_preview"
        )
        started_idx = next(
            i for i, (ev, _) in enumerate(self.events) if ev == "assignment_started"
        )
        self.assertLess(preview_idx, started_idx)

    def test_preview_holds_in_use_flag(self):
        """`in_use` must remain False for at least most of the preview
        window, i.e. the flag flip is deferred, not immediate."""
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_preview" for ev, _ in self.events
                )
            )
        )
        # Immediately after the preview fires, in_use is still False.
        snap = self.sched.snapshot()
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))
        # After the preview window elapses, in_use flips True.
        self.assertTrue(
            _wait_until(
                lambda: any(
                    f["in_use"] for f in self.sched.snapshot()["fixtures"]
                ),
                timeout=1.0,
            )
        )

    def test_api_sim_user_runtimes_excludes_stopped(self):
        self.assertIn(RUNTIME_RUNNING, API_SIM_USER_RUNTIMES)
        self.assertIn(RUNTIME_PAUSED, API_SIM_USER_RUNTIMES)
        self.assertNotIn(RUNTIME_STOPPED, API_SIM_USER_RUNTIMES)

    def test_enqueue_succeeds_while_paused(self):
        self.sched.set_sim_runtime(RUNTIME_PAUSED)
        r = self.sched.enqueue("pee")
        self.assertTrue(r.get("ok"), msg=r.get("error"))
        self.assertEqual(len(self.sched.snapshot()["queue"]), 1)

    def test_enqueue_succeeds_while_stopped(self):
        self.sched.set_sim_runtime(RUNTIME_STOPPED)
        r = self.sched.enqueue("pee")
        self.assertTrue(r.get("ok"), msg=r.get("error"))
        self.assertEqual(len(self.sched.snapshot()["queue"]), 1)

    def test_sim_time_does_not_advance_while_paused(self):
        self.sched.set_sim_runtime(RUNTIME_RUNNING)
        t0 = self.sched.snapshot()["sim_time_s"]
        self.sched.set_sim_runtime(RUNTIME_PAUSED)
        time.sleep(0.35)
        t1 = self.sched.snapshot()["sim_time_s"]
        self.assertEqual(t0, t1)

    def test_clear_queue_while_paused(self):
        self.sched.set_sim_runtime(RUNTIME_PAUSED)
        self.assertTrue(self.sched.enqueue("pee").get("ok"))
        self.assertTrue(self.sched.clear_queue().get("ok"))
        self.assertEqual(self.sched.snapshot()["queue"], [])

    def test_clear_queue_cancels_reservations(self):
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_preview" for ev, _ in self.events
                )
            )
        )
        self.sched.clear_queue()
        # The cancellation event was emitted and the fixture is no
        # longer reserved or in-use.
        self.assertTrue(
            any(ev == "assignment_preview_cancelled" for ev, _ in self.events)
        )
        snap = self.sched.snapshot()
        self.assertTrue(all(not f["reserved"] for f in snap["fixtures"]))
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))
        self.assertEqual(snap["queue"], [])

    def test_multiple_queued_users_all_preview_before_commit(self):
        """All three simultaneously queued users should get a preview
        before any of them commit to `in_use`."""
        self.sched.enqueue("pee")
        self.sched.enqueue("pee")
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: sum(
                    1 for ev, _ in self.events if ev == "assignment_preview"
                )
                >= 3,
                timeout=1.0,
            )
        )
        previews = [d for ev, d in self.events if ev == "assignment_preview"]
        started = [d for ev, d in self.events if ev == "assignment_started"]
        # All three previews fire, and each fires before its matching
        # assignment_started. Because commits only happen once the
        # preview window elapses, a single-tick view catches only
        # previews — assignment_started may not be present yet.
        self.assertGreaterEqual(len(previews), 3)
        for p in previews:
            matching = [s for s in started if s["fixture_id"] == p["fixture_id"]]
            if matching:
                p_idx = self.events.index(("assignment_preview", p))
                s_idx = self.events.index(("assignment_started", matching[0]))
                self.assertLess(p_idx, s_idx)

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

    # -- play/pause/reset lifecycle (regression for Play/Pause drift) --

    def test_pause_freezes_active_occupancy(self):
        """Pausing mid-occupancy must snapshot remaining seconds and
        clear `busy_until`, so wall-clock time does not elapse while
        paused."""
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    f["in_use"] for f in self.sched.snapshot()["fixtures"]
                ),
                timeout=1.5,
            )
        )
        r = self.sched.set_sim_runtime(RUNTIME_PAUSED)
        self.assertTrue(r.get("ok"), msg=r.get("error"))
        snap = self.sched.snapshot()
        in_use = [f for f in snap["fixtures"] if f["in_use"]]
        self.assertEqual(len(in_use), 1)
        f = in_use[0]
        self.assertIsNone(f["busy_until"])
        self.assertIsNotNone(f["occupancy_remaining_s"])
        self.assertGreater(f["occupancy_remaining_s"], 0)

    def test_pause_freezes_preview(self):
        """Pausing during the preview window must snapshot remaining
        preview seconds and clear `reserved_until`."""
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: any(
                    ev == "assignment_preview" for ev, _ in self.events
                )
            )
        )
        self.sched.set_sim_runtime(RUNTIME_PAUSED)
        snap = self.sched.snapshot()
        reserved = [f for f in snap["fixtures"] if f["reserved"]]
        self.assertEqual(len(reserved), 1)
        f = reserved[0]
        self.assertIsNone(f["reserved_until"])
        self.assertIsNotNone(f["preview_remaining_s"])
        self.assertGreaterEqual(f["preview_remaining_s"], 0)

    def test_resume_preserves_sim_time_and_counters(self):
        """Running -> pause -> running must preserve sim_time and
        satisfied-user counters across the transition."""
        self.sched.enqueue("pee")
        self.assertTrue(
            _wait_until(
                lambda: self.sched.snapshot()["satisfied_users"] >= 1,
                timeout=2.0,
            )
        )
        snap_before = self.sched.snapshot()
        sat_before = snap_before["satisfied_users"]
        sim_before = snap_before["sim_time_s"]
        self.sched.set_sim_runtime(RUNTIME_PAUSED)
        time.sleep(0.3)
        self.sched.set_sim_runtime(RUNTIME_RUNNING)
        snap_after = self.sched.snapshot()
        self.assertEqual(snap_after["satisfied_users"], sat_before)
        # Sim time should be at-least as before; but must not have
        # advanced during the 0.3s pause.
        self.assertGreaterEqual(snap_after["sim_time_s"], sim_before)
        self.assertLess(snap_after["sim_time_s"], sim_before + 0.3)

    def test_reset_while_running_clears_state_and_pauses(self):
        """Reset mid-run must clear queue/fixtures/counters, zero
        sim_time, and leave runtime in PAUSED so the next Play starts
        from a clean slate."""
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
        self.assertEqual(snap["exited_users"], 0)
        self.assertEqual(snap["total_arrivals"], 0)
        self.assertEqual(snap["sim_time_s"], 0.0)
        self.assertEqual(snap["runtime"], RUNTIME_PAUSED)
        self.assertTrue(all(not f["in_use"] for f in snap["fixtures"]))
        self.assertTrue(all(not f["reserved"] for f in snap["fixtures"]))


if __name__ == "__main__":
    unittest.main()
