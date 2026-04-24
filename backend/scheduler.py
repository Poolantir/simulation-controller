"""
Dummy Mode scheduler.

Backend-authoritative FIFO scheduler that drives the frontend's digital
twin while the app is in Dummy Mode. Users are enqueued by the UI, a
background ticker pulls them off the queue whenever an eligible fixture
is free, and the occupancy of each fixture is decremented in real time
as simulated pee/poo durations elapse.

Design notes
------------
- All mutable state is protected by a single `threading.RLock`.
- A dedicated worker thread drives a ~10 Hz tick (`TICK_INTERVAL_S`).
  The tick (a) releases fixtures whose `busy_until` has passed and
  (b) tries to assign the queue head to any free eligible fixture.
- Assignments are sampled from the behavioral-model weights computed
  from the *current* layout/conditions/free-set, so occupancy changes
  the odds of each remaining fixture in real time.
- Event subscribers receive high-level scheduler events
  (`scheduler_state`, `assignment_started`, `assignment_completed`,
  `queue_updated`, `mode_changed`, `config_updated`, `reset`).
- The scheduler is intentionally transport-agnostic: it does not talk
  to BLE. Dummy Mode simulates usage entirely in-process.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence

from behavioral_model import (
    compute_candidate_weights,
    conditions_from_frontend_payload,
    pick_weighted,
)

log = logging.getLogger("scheduler")


FIXTURE_COUNT = 6
TICK_INTERVAL_S = 0.1
PEE_DURATION_RANGE_S = (2.0, 4.0)
POO_DURATION_RANGE_S = (10.0, 15.0)
# How long the UI shows an arrow + user icon traveling from queue to
# the target fixture before the assignment actually starts. Exposed as
# a module-level constant so tests can shorten it deterministically.
PREVIEW_DURATION_S = 3.0


MODE_SIM = "SIM"
MODE_TEST = "TEST"
MODE_DUMMY = "DUMMY"
VALID_MODES = (MODE_SIM, MODE_TEST, MODE_DUMMY)

DEFAULT_TOILET_TYPES: List[str] = [
    "stall",
    "stall",
    "stall",
    "urinal",
    "urinal",
    "urinal",
]


@dataclass
class QueueItem:
    id: int
    type: str  # "pee" | "poo"
    enqueued_at: float

    def to_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "type": self.type, "enqueued_at": self.enqueued_at}


@dataclass
class Fixture:
    id: int  # 1-based global id (1..6)
    kind: str  # "stall" | "urinal" | "nonexistent"
    condition: str = "Clean"
    in_use: bool = False
    busy_until: Optional[float] = None
    current_user_type: Optional[str] = None  # "pee" | "poo" while in_use
    # Reservation ("preview") state: while True the fixture is committed
    # to a specific queued user but `in_use` hasn't flipped yet. The
    # scheduler holds this state for PREVIEW_DURATION_S so the UI can
    # animate an arrow / user icon traveling from the queue to this
    # fixture before occupancy visually starts.
    reserved: bool = False
    reserved_until: Optional[float] = None
    reserved_user_type: Optional[str] = None
    reserved_queue_item_id: Optional[int] = None
    reserved_duration_s: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "condition": self.condition,
            "in_use": self.in_use,
            "busy_until": self.busy_until,
            "current_user_type": self.current_user_type,
            "reserved": self.reserved,
            "reserved_until": self.reserved_until,
            "reserved_user_type": self.reserved_user_type,
            "reserved_queue_item_id": self.reserved_queue_item_id,
        }


@dataclass
class SchedulerConfig:
    restroom_preset: str = "maclean_2m"
    toilet_types: List[str] = field(default_factory=lambda: list(DEFAULT_TOILET_TYPES))
    shy_peer_pct: float = 5.0
    middle_toilet_first_choice_pct: float = 2.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "restroom_preset": self.restroom_preset,
            "toilet_types": list(self.toilet_types),
            "shy_peer_pct": self.shy_peer_pct,
            "middle_toilet_first_choice_pct": self.middle_toilet_first_choice_pct,
        }


SchedulerEventCb = Callable[[str, Dict[str, Any]], None]


class Scheduler:
    """Thread-safe dummy scheduler."""

    def __init__(self, *, rng: Optional[random.Random] = None) -> None:
        self._lock = threading.RLock()
        self._rng = rng or random.Random()
        self._config = SchedulerConfig()
        self._fixtures: Dict[int, Fixture] = {}
        self._init_fixtures_from_types(self._config.toilet_types)
        self._queue: List[QueueItem] = []
        self._next_queue_id: int = 1
        self._mode: str = MODE_SIM
        self._satisfied_users: int = 0
        self._started_at: Optional[float] = None

        # Subscribers are called synchronously; server.py wraps them
        # with its own thread-safe fan-out (see `/api/scheduler/stream`).
        self._subscribers: List[SchedulerEventCb] = []
        self._sub_lock = threading.Lock()

        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    # ---- lifecycle ---------------------------------------------------

    def start(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(
                target=self._run, name="scheduler-tick", daemon=True
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        t = self._thread
        if t is not None:
            t.join(timeout=1.0)
        self._thread = None

    # ---- subscribers -------------------------------------------------

    def subscribe(self, cb: SchedulerEventCb) -> Callable[[], None]:
        with self._sub_lock:
            self._subscribers.append(cb)

        def unsubscribe() -> None:
            with self._sub_lock:
                try:
                    self._subscribers.remove(cb)
                except ValueError:
                    pass

        return unsubscribe

    def _emit(self, event: str, data: Dict[str, Any]) -> None:
        with self._sub_lock:
            subs = list(self._subscribers)
        for cb in subs:
            try:
                cb(event, data)
            except Exception:
                log.exception("scheduler subscriber raised")

    # ---- public API --------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "mode": self._mode,
                "config": self._config.to_dict(),
                "queue": [q.to_dict() for q in self._queue],
                "fixtures": [
                    self._fixtures[i + 1].to_dict() for i in range(FIXTURE_COUNT)
                ],
                "satisfied_users": self._satisfied_users,
                "started_at": self._started_at,
                "now": time.time(),
            }

    def set_mode(self, mode: str, *, clear_queue_on_switch: bool = True) -> Dict[str, Any]:
        if mode not in VALID_MODES:
            return {"ok": False, "error": f"invalid mode {mode!r}"}
        cancelled: List[Dict[str, Any]] = []
        with self._lock:
            if mode == self._mode:
                return {"ok": True, "mode": self._mode}
            self._mode = mode
            # When leaving Dummy mid-run the in-flight work is meaningless,
            # so wipe transient state. The user's Sim/Test config is kept.
            if mode != MODE_DUMMY and clear_queue_on_switch:
                cancelled = self._cancel_reservations_locked()
                self._queue.clear()
                self._clear_fixtures_locked()
        for ev in cancelled:
            self._emit("assignment_preview_cancelled", ev)
        self._emit("mode_changed", {"mode": mode})
        self._emit_state()
        return {"ok": True, "mode": mode}

    def set_config(
        self,
        *,
        restroom_preset: Optional[str] = None,
        toilet_types: Optional[Sequence[str]] = None,
        shy_peer_pct: Optional[float] = None,
        middle_toilet_first_choice_pct: Optional[float] = None,
        restroom_conditions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            if restroom_preset is not None:
                self._config.restroom_preset = str(restroom_preset)
            types_changed = False
            if toilet_types is not None:
                normalised = _normalise_toilet_types(toilet_types)
                if normalised != self._config.toilet_types:
                    self._config.toilet_types = normalised
                    self._init_fixtures_from_types(normalised)
                    types_changed = True
            if shy_peer_pct is not None:
                self._config.shy_peer_pct = float(shy_peer_pct)
            if middle_toilet_first_choice_pct is not None:
                self._config.middle_toilet_first_choice_pct = float(
                    middle_toilet_first_choice_pct
                )
            if restroom_conditions is not None:
                cond_map = conditions_from_frontend_payload(
                    self._config.toilet_types, restroom_conditions
                )
                for idx, cond in cond_map.items():
                    f = self._fixtures.get(idx + 1)
                    if f is None:
                        continue
                    f.condition = cond
                    # Non-existent fixtures can never be in-use.
                    if f.kind == "nonexistent":
                        f.in_use = False
                        f.busy_until = None
                        f.current_user_type = None
            # If the layout changed, any stale in-use state is meaningless.
            if types_changed:
                for f in self._fixtures.values():
                    if f.kind == "nonexistent":
                        f.in_use = False
                        f.busy_until = None
                        f.current_user_type = None
            # Reservations on fixtures that just became non-existent or
            # out-of-order must be cancelled so the UI stops animating
            # toward a fixture that isn't valid any more.
            cancelled = self._cancel_reservations_locked(
                predicate=lambda f: (
                    f.kind == "nonexistent" or f.condition == "Out-of-Order"
                )
            )
        for ev in cancelled:
            self._emit("assignment_preview_cancelled", ev)
        self._emit("config_updated", self._config.to_dict())
        self._emit_state()
        return {"ok": True, "config": self._config.to_dict()}

    def enqueue(self, user_type: str) -> Dict[str, Any]:
        u = str(user_type).lower()
        if u not in ("pee", "poo"):
            return {"ok": False, "error": f"invalid user type {user_type!r}"}
        with self._lock:
            item = QueueItem(id=self._next_queue_id, type=u, enqueued_at=time.time())
            self._next_queue_id += 1
            self._queue.append(item)
            if self._started_at is None:
                self._started_at = time.time()
        self._emit("queue_updated", {"queue": [q.to_dict() for q in self._queue_copy()]})
        # Try to assign immediately so small queues feel instantaneous.
        self._try_assign()
        return {"ok": True, "item": item.to_dict()}

    def clear_queue(self) -> Dict[str, Any]:
        with self._lock:
            self._queue.clear()
            cancelled = self._cancel_reservations_locked()
        self._emit("queue_updated", {"queue": []})
        for ev in cancelled:
            self._emit("assignment_preview_cancelled", ev)
        if cancelled:
            self._emit_state()
        return {"ok": True}

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._queue.clear()
            self._next_queue_id = 1
            self._clear_fixtures_locked()
            self._satisfied_users = 0
            self._started_at = None
        self._emit("reset", {})
        self._emit_state()
        return {"ok": True}

    # ---- internal helpers --------------------------------------------

    def _queue_copy(self) -> List[QueueItem]:
        with self._lock:
            return list(self._queue)

    def _init_fixtures_from_types(self, toilet_types: Sequence[str]) -> None:
        """Rebuild the fixture table preserving cleanliness where possible."""
        prior = self._fixtures
        self._fixtures = {}
        for i, t in enumerate(toilet_types):
            fid = i + 1
            kind = str(t).lower()
            if kind not in ("stall", "urinal", "nonexistent"):
                kind = "nonexistent"
            existing = prior.get(fid)
            if kind == "nonexistent":
                cond = "Non-Existent"
            elif existing and existing.condition != "Non-Existent":
                cond = existing.condition
            else:
                cond = "Clean"
            self._fixtures[fid] = Fixture(id=fid, kind=kind, condition=cond)

    def _clear_fixtures_locked(self) -> None:
        for f in self._fixtures.values():
            f.in_use = False
            f.busy_until = None
            f.current_user_type = None
            f.reserved = False
            f.reserved_until = None
            f.reserved_user_type = None
            f.reserved_queue_item_id = None
            f.reserved_duration_s = None

    def _cancel_reservations_locked(
        self,
        predicate: Optional[Callable[[Fixture], bool]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Clear preview reservations matching `predicate` (or all when None)
        and return cancellation event payloads. Caller is responsible for
        emitting `assignment_preview_cancelled` outside the lock.
        """
        cancelled: List[Dict[str, Any]] = []
        for fixture in self._fixtures.values():
            if not fixture.reserved:
                continue
            if predicate is not None and not predicate(fixture):
                continue
            cancelled.append(
                {
                    "queue_item_id": fixture.reserved_queue_item_id,
                    "fixture_id": fixture.id,
                    "fixture_kind": fixture.kind,
                    "user_type": fixture.reserved_user_type,
                }
            )
            fixture.reserved = False
            fixture.reserved_until = None
            fixture.reserved_user_type = None
            fixture.reserved_queue_item_id = None
            fixture.reserved_duration_s = None
        return cancelled

    def _eligible_free_indices(self) -> List[int]:
        """
        0-indexed list of fixtures that are existing, not-in-use, and
        not currently reserved for a queued user's preview animation.
        """
        free: List[int] = []
        for i in range(FIXTURE_COUNT):
            f = self._fixtures.get(i + 1)
            if f is None:
                continue
            if f.kind == "nonexistent":
                continue
            if f.in_use or f.reserved:
                continue
            free.append(i)
        return free

    def _conditions_by_index(self) -> Dict[int, str]:
        return {i: self._fixtures[i + 1].condition for i in range(FIXTURE_COUNT)}

    def _sample_duration(self, user_type: str) -> float:
        lo, hi = (
            PEE_DURATION_RANGE_S if user_type == "pee" else POO_DURATION_RANGE_S
        )
        return self._rng.uniform(lo, hi)

    def _try_assign(self) -> None:
        """
        Attempt to reserve free eligible fixtures for queued users.

        A reservation is the "preview" step before real occupancy: the
        queue head is *not* popped yet, the fixture's `in_use` stays
        False, and we emit `assignment_preview` so the UI can animate
        an arrow + user icon traveling from queue to fixture for
        ``PREVIEW_DURATION_S`` seconds. `_commit_reservations` promotes
        each reservation into a real assignment once the preview window
        elapses.

        Head-blocks-queue: if the first non-reserved queue item can't
        be placed (e.g. pooer with no free stall), nobody behind them
        is reserved either. Items already in preview are skipped.
        """
        if self._mode != MODE_DUMMY:
            return
        preview_events: List[Dict[str, Any]] = []
        with self._lock:
            reserved_ids = {
                f.reserved_queue_item_id
                for f in self._fixtures.values()
                if f.reserved and f.reserved_queue_item_id is not None
            }
            for head in list(self._queue):
                if head.id in reserved_ids:
                    # Already in preview on some fixture; try next in line.
                    continue
                free = self._eligible_free_indices()
                if not free:
                    break
                weights = compute_candidate_weights(
                    toilet_types=self._config.toilet_types,
                    conditions_by_index=self._conditions_by_index(),
                    free_indices=free,
                    user_type=head.type,
                    shy_peer_pct=self._config.shy_peer_pct,
                    middle_pct=self._config.middle_toilet_first_choice_pct,
                )
                pick_idx = pick_weighted(weights, self._rng)
                if pick_idx is None:
                    # No eligible candidate for *this* user type right now.
                    break
                fixture = self._fixtures[pick_idx + 1]
                # Sample the real occupancy duration up-front so it's
                # deterministic relative to the enqueue time even if
                # the RNG is advanced between reserve and commit.
                duration = self._sample_duration(head.type)
                now = time.time()
                fixture.reserved = True
                fixture.reserved_until = now + PREVIEW_DURATION_S
                fixture.reserved_user_type = head.type
                fixture.reserved_queue_item_id = head.id
                fixture.reserved_duration_s = duration
                reserved_ids.add(head.id)
                preview_events.append(
                    {
                        "queue_item_id": head.id,
                        "user_type": head.type,
                        "fixture_id": fixture.id,
                        "fixture_kind": fixture.kind,
                        "duration_s": duration,
                        "reserved_until": fixture.reserved_until,
                        "preview_duration_s": PREVIEW_DURATION_S,
                        "weights": {str(k + 1): v for k, v in weights.items()},
                    }
                )
        for ev in preview_events:
            self._emit("assignment_preview", ev)
        if preview_events:
            self._emit_state()

    def _commit_reservations(self) -> None:
        """
        Promote any reservation whose preview window has elapsed into
        a real assignment: flip `in_use`, start the occupancy countdown
        from *now*, pop the queue item, and emit `assignment_started`
        (plus `queue_updated`).

        Reservations commit in chronological order (earliest
        `reserved_until` first) so `assignment_started` events preserve
        FIFO queueing even when multiple fixtures elapse in the same
        tick.
        """
        commit_events: List[Dict[str, Any]] = []
        queue_changed = False
        with self._lock:
            now = time.time()
            pending = [
                f
                for f in self._fixtures.values()
                if f.reserved
                and f.reserved_until is not None
                and f.reserved_until <= now
            ]
            pending.sort(key=lambda f: (f.reserved_until or 0.0, f.id))
            for fixture in pending:
                user_type = fixture.reserved_user_type or "pee"
                queue_item_id = fixture.reserved_queue_item_id
                duration = fixture.reserved_duration_s
                if duration is None:
                    duration = self._sample_duration(user_type)
                fixture.reserved = False
                fixture.reserved_until = None
                fixture.reserved_user_type = None
                fixture.reserved_queue_item_id = None
                fixture.reserved_duration_s = None
                fixture.in_use = True
                fixture.busy_until = now + duration
                fixture.current_user_type = user_type
                if queue_item_id is not None:
                    for i, q in enumerate(self._queue):
                        if q.id == queue_item_id:
                            self._queue.pop(i)
                            queue_changed = True
                            break
                commit_events.append(
                    {
                        "queue_item_id": queue_item_id,
                        "user_type": user_type,
                        "fixture_id": fixture.id,
                        "fixture_kind": fixture.kind,
                        "duration_s": duration,
                        "busy_until": fixture.busy_until,
                    }
                )
        for ev in commit_events:
            self._emit("assignment_started", ev)
        if queue_changed:
            self._emit(
                "queue_updated",
                {"queue": [q.to_dict() for q in self._queue_copy()]},
            )
        if commit_events:
            self._emit_state()

    def _release_completed(self) -> None:
        released: List[Dict[str, Any]] = []
        with self._lock:
            now = time.time()
            for fixture in self._fixtures.values():
                if (
                    fixture.in_use
                    and fixture.busy_until is not None
                    and fixture.busy_until <= now
                ):
                    user_type = fixture.current_user_type
                    fixture.in_use = False
                    fixture.busy_until = None
                    fixture.current_user_type = None
                    self._satisfied_users += 1
                    released.append(
                        {
                            "fixture_id": fixture.id,
                            "fixture_kind": fixture.kind,
                            "user_type": user_type,
                            "satisfied_users": self._satisfied_users,
                        }
                    )
        for ev in released:
            self._emit("assignment_completed", ev)
        if released:
            self._emit_state()

    def _emit_state(self) -> None:
        self._emit("scheduler_state", self.snapshot())

    def _run(self) -> None:
        log.info("scheduler tick thread started")
        while not self._stop.is_set():
            try:
                self._release_completed()
                self._commit_reservations()
                self._try_assign()
            except Exception:
                log.exception("scheduler tick raised")
            self._stop.wait(TICK_INTERVAL_S)
        log.info("scheduler tick thread stopped")


def _normalise_toilet_types(types: Iterable[str]) -> List[str]:
    """
    Coerce an arbitrary iterable into a 6-element list of
    stall/urinal/nonexistent tokens. Pads / trims as needed and replaces
    unknown tokens with `"nonexistent"` so we never end up with invalid
    fixture state.
    """
    out: List[str] = []
    for t in types:
        s = str(t).lower()
        if s not in ("stall", "urinal", "nonexistent"):
            s = "nonexistent"
        out.append(s)
        if len(out) >= FIXTURE_COUNT:
            break
    while len(out) < FIXTURE_COUNT:
        out.append("nonexistent")
    return out


__all__ = [
    "Scheduler",
    "SchedulerConfig",
    "QueueItem",
    "Fixture",
    "FIXTURE_COUNT",
    "PEE_DURATION_RANGE_S",
    "POO_DURATION_RANGE_S",
    "PREVIEW_DURATION_S",
    "MODE_SIM",
    "MODE_TEST",
    "MODE_DUMMY",
    "VALID_MODES",
]
