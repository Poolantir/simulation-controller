# AI-ASSISTED
# Simulation Controller
# Matt Krueger, April 2026 

from __future__ import annotations

import logging
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence

from behavioral_model import (
    compute_candidate_weights,
    compute_group_etiquette_shares,
    conditions_from_frontend_payload,
    pick_sequential,
    pick_weighted,
)
import server_log

log = logging.getLogger("scheduler")


FIXTURE_COUNT = 6
TICK_INTERVAL_S = 0.1
PEE_DURATION_RANGE_S = (2.0, 4.0)
POO_DURATION_RANGE_S = (10.0, 15.0)
PREVIEW_DURATION_S = 3.0
QUEUE_WAIT_TIMEOUT_S = 10.0

MODE_SIM = "SIM"
MODE_TEST = "TEST"
MODE_DUMMY = "DUMMY"
VALID_MODES = (MODE_SIM, MODE_TEST, MODE_DUMMY)

RUNTIME_STOPPED = "stopped"
RUNTIME_PAUSED = "paused"
RUNTIME_RUNNING = "running"
VALID_RUNTIMES = (RUNTIME_STOPPED, RUNTIME_PAUSED, RUNTIME_RUNNING)
API_SIM_USER_RUNTIMES = (RUNTIME_RUNNING, RUNTIME_PAUSED)

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
    type: str
    enqueued_at: float
    enqueued_at_sim_s: float = 0.0
    duration_s: float = 0.0
    prefers_stall: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "enqueued_at": self.enqueued_at,
            "enqueued_at_sim_s": self.enqueued_at_sim_s,
            "duration_s": self.duration_s,
            "prefers_stall": self.prefers_stall,
        }


@dataclass
class Fixture:
    id: int 
    kind: str
    condition: str = "Clean"
    in_use: bool = False
    busy_until: Optional[float] = None
    current_user_type: Optional[str] = None  
    current_queue_item_id: Optional[int] = None
    current_duration_s: Optional[float] = None
    reserved: bool = False
    reserved_until: Optional[float] = None
    reserved_user_type: Optional[str] = None
    reserved_queue_item_id: Optional[int] = None
    reserved_duration_s: Optional[float] = None
    preview_started_sim_s: Optional[float] = None
    occupancy_remaining_s: Optional[float] = None
    preview_remaining_s: Optional[float] = None
    use_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "condition": self.condition,
            "in_use": self.in_use,
            "busy_until": self.busy_until,
            "current_user_type": self.current_user_type,
            "current_queue_item_id": self.current_queue_item_id,
            "current_duration_s": self.current_duration_s,
            "reserved": self.reserved,
            "reserved_until": self.reserved_until,
            "reserved_user_type": self.reserved_user_type,
            "reserved_queue_item_id": self.reserved_queue_item_id,
            "reserved_duration_s": self.reserved_duration_s,
            "preview_started_sim_s": self.preview_started_sim_s,
            "occupancy_remaining_s": self.occupancy_remaining_s,
            "preview_remaining_s": self.preview_remaining_s,
            "use_count": self.use_count,
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
    def __init__(
        self,
        *,
        rng: Optional[random.Random] = None,
        send_to_node: Optional[Callable[[int, Dict[str, Any]], Dict[str, Any]]] = None,
    ) -> None:
        self._lock = threading.RLock()
        self._rng = rng or random.Random()
        self._send_to_node = send_to_node
        self._node_connections: List[bool] = [False] * FIXTURE_COUNT
        self._config = SchedulerConfig()
        self._fixtures: Dict[int, Fixture] = {}
        self._init_fixtures_from_types(self._config.toilet_types)
        self._queue: List[QueueItem] = []
        self._next_queue_id: int = 1
        self._mode: str = MODE_SIM
        self._satisfied_users: int = 0
        self._exited_users: int = 0
        self._total_arrivals: int = 0
        self._sim_time_s: float = 0.0
        self._last_tick_wall: Optional[float] = None
        self._runtime: str = RUNTIME_PAUSED
        self._started_at: Optional[float] = None
        self._subscribers: List[SchedulerEventCb] = []
        self._sub_lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

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

    def set_node_connections(self, connections: Sequence[bool]) -> None:
        with self._lock:
            for i in range(FIXTURE_COUNT):
                self._node_connections[i] = bool(connections[i]) if i < len(connections) else False

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "mode": self._mode,
                "runtime": self._runtime,
                "sim_time_s": self._sim_time_s,
                "config": self._config.to_dict(),
                "queue": [q.to_dict() for q in self._queue],
                "fixtures": [
                    self._fixtures[i + 1].to_dict() for i in range(FIXTURE_COUNT)
                ],
                "satisfied_users": self._satisfied_users,
                "exited_users": self._exited_users,
                "total_arrivals": self._total_arrivals,
                "started_at": self._started_at,
                "now": time.time(),
            }

    def set_mode(self, mode: str, *, clear_queue_on_switch: bool = True) -> Dict[str, Any]:
        if mode not in VALID_MODES:
            return {"ok": False, "error": f"invalid mode {mode!r}"}
        cancelled: List[Dict[str, Any]] = []
        sim_mode_nodes: List[int] = []
        with self._lock:
            if mode == self._mode:
                return {"ok": True, "mode": self._mode}
            self._mode = mode
            if clear_queue_on_switch:
                cancelled = self._cancel_reservations_locked()
                self._queue.clear()
                self._clear_fixtures_locked()
            if mode == MODE_SIM:
                for i in range(FIXTURE_COUNT):
                    if self._node_connections[i]:
                        sim_mode_nodes.append(i + 1)
        for ev in cancelled:
            self._emit("assignment_preview_cancelled", ev)
        if sim_mode_nodes and self._send_to_node:
            payload = {"command": "MODE", "type": "SET", "action": "SIM"}
            for node_id in sim_mode_nodes:
                try:
                    self._send_to_node(node_id, payload)
                except Exception:
                    log.exception("MODE SET SIM to node %d failed", node_id)
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
        config_diffs: List[str] = []
        with self._lock:
            if restroom_preset is not None:
                old = self._config.restroom_preset
                self._config.restroom_preset = str(restroom_preset)
                if str(restroom_preset) != old:
                    config_diffs.append(
                        f"[CONFIGURATION]: Restroom changed; {old} -> {restroom_preset}"
                    )
            types_changed = False
            if toilet_types is not None:
                normalised = _normalise_toilet_types(toilet_types)
                if normalised != self._config.toilet_types:
                    self._config.toilet_types = normalised
                    self._init_fixtures_from_types(normalised)
                    types_changed = True
            if shy_peer_pct is not None:
                old = self._config.shy_peer_pct
                self._config.shy_peer_pct = float(shy_peer_pct)
                if float(shy_peer_pct) != old:
                    config_diffs.append(
                        f"[CONFIGURATION]: Shy Pee-er Population changed; {old:.0f}% -> {float(shy_peer_pct):.0f}%"
                    )
            if middle_toilet_first_choice_pct is not None:
                old = self._config.middle_toilet_first_choice_pct
                self._config.middle_toilet_first_choice_pct = float(
                    middle_toilet_first_choice_pct
                )
                if float(middle_toilet_first_choice_pct) != old:
                    config_diffs.append(
                        f"[CONFIGURATION]: Middle Toilet as First Choice changed; {old:.0f}% -> {float(middle_toilet_first_choice_pct):.0f}%"
                    )
            if restroom_conditions is not None:
                cond_map = conditions_from_frontend_payload(
                    self._config.toilet_types, restroom_conditions
                )
                for idx, cond in cond_map.items():
                    f = self._fixtures.get(idx + 1)
                    if f is None:
                        continue
                    old_cond = f.condition
                    f.condition = cond
                    if cond != old_cond:
                        kind = f.kind.capitalize() if f.kind != "nonexistent" else "Fixture"
                        config_diffs.append(
                            f"[CONFIGURATION]: {kind} {f.id} condition changed; {old_cond} -> {cond}"
                        )
                    if f.kind == "nonexistent":
                        f.in_use = False
                        f.busy_until = None
                        f.current_user_type = None
                        f.current_queue_item_id = None
                        f.current_duration_s = None
            if types_changed:
                for f in self._fixtures.values():
                    if f.kind == "nonexistent":
                        f.in_use = False
                        f.busy_until = None
                        f.current_user_type = None
                        f.current_queue_item_id = None
                        f.current_duration_s = None
            cancelled = self._cancel_reservations_locked(
                predicate=lambda f: (
                    f.kind == "nonexistent" or f.condition == "Out-of-Order"
                )
            )
        for line in config_diffs:
            server_log.publish_line(line)
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
            at_sim = self._sim_time_s
            prefers_stall = False
            if u == "pee":
                has_urinals = any(
                    str(t).lower() == "urinal"
                    for t in self._config.toilet_types
                )
                if has_urinals:
                    prefers_stall = (
                        self._rng.random() < self._config.shy_peer_pct / 100.0
                    )
                else:
                    prefers_stall = True
            item = QueueItem(
                id=self._next_queue_id,
                type=u,
                enqueued_at=time.time(),
                enqueued_at_sim_s=at_sim,
                duration_s=self._sample_duration(u),
                prefers_stall=prefers_stall,
            )
            self._next_queue_id += 1
            self._queue.append(item)
            if self._mode in (MODE_DUMMY, MODE_SIM):
                self._total_arrivals += 1
            if self._started_at is None:
                self._started_at = time.time()
        self._emit("queue_updated", {"queue": [q.to_dict() for q in self._queue_copy()]})
        self._try_assign()
        return {"ok": True, "item": item.to_dict()}

    def sample_duration(self, user_type: str) -> Dict[str, Any]:
        u = str(user_type).lower()
        if u not in ("pee", "poo"):
            return {"ok": False, "error": f"invalid user type {user_type!r}"}
        with self._lock:
            duration = self._sample_duration(u)
        return {"ok": True, "type": u, "duration_s": duration}

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
            self._exited_users = 0
            self._total_arrivals = 0
            self._sim_time_s = 0.0
            self._last_tick_wall = None
            self._runtime = RUNTIME_PAUSED
            self._started_at = None
        server_log.publish_line("=============== RESET ===============")
        self._emit("reset", {})
        self._emit_state()
        return {"ok": True}

    def set_sim_runtime(self, runtime: str) -> Dict[str, Any]:
        r = str(runtime or "").lower()
        if r not in ("running", "paused", "stopped"):
            return {"ok": False, "error": f"invalid runtime {runtime!r}"}
        if self._mode not in (MODE_DUMMY, MODE_SIM):
            return {"ok": False, "error": "sim runtime only applies in DUMMY or SIM mode"}
        cancelled: List[Dict[str, Any]] = []
        now = time.time()
        with self._lock:
            prev = self._runtime
            if r == RUNTIME_PAUSED:
                if prev != RUNTIME_RUNNING:
                    return {"ok": True, "runtime": self._runtime}
                self._freeze_deadlines_for_pause_locked(now)
                self._runtime = RUNTIME_PAUSED
            elif r == RUNTIME_STOPPED:
                if prev in (RUNTIME_RUNNING, RUNTIME_PAUSED):
                    cancelled = self._cancel_reservations_locked()
                    self._queue.clear()
                    self._clear_fixtures_locked()
                self._runtime = RUNTIME_STOPPED
                self._last_tick_wall = None
            else:  # running
                if prev == RUNTIME_PAUSED:
                    self._unfreeze_deadlines_for_resume_locked(now)
                elif prev == RUNTIME_STOPPED:
                    self._satisfied_users = 0
                    self._exited_users = 0
                    self._total_arrivals = 0
                    self._sim_time_s = 0.0
                    self._started_at = None
                    self._next_queue_id = 1
                    self._queue.clear()
                    self._clear_fixtures_locked()
                self._runtime = RUNTIME_RUNNING
                self._last_tick_wall = now
        for c in cancelled:
            self._emit("assignment_preview_cancelled", c)
        if r == RUNTIME_RUNNING:
            server_log.publish_line("=============== PLAY ===============")
        elif r == RUNTIME_PAUSED:
            self._publish_pause_summary()
        self._emit("sim_runtime_changed", {"runtime": r})
        self._emit_state()
        if self._mode == MODE_SIM and self._send_to_node:
            control_action = "PLAY" if r == RUNTIME_RUNNING else "PAUSE" if r == RUNTIME_PAUSED else None
            if control_action:
                payload = {"command": "SIM", "id": "", "type": "CONTROL", "action": control_action}
                for i in range(FIXTURE_COUNT):
                    if self._node_connections[i]:
                        try:
                            self._send_to_node(i + 1, payload)
                        except Exception:
                            log.exception("SIM CONTROL %s to node %d failed", control_action, i + 1)
        return {"ok": True, "runtime": r}

    def _freeze_deadlines_for_pause_locked(self, now: float) -> None:
        for f in self._fixtures.values():
            if f.in_use and f.busy_until is not None and f.occupancy_remaining_s is None:
                f.occupancy_remaining_s = max(0.0, f.busy_until - now)
                f.busy_until = None
            if f.reserved and f.reserved_until is not None and f.preview_remaining_s is None:
                f.preview_remaining_s = max(0.0, f.reserved_until - now)
                f.reserved_until = None

    def _unfreeze_deadlines_for_resume_locked(self, now: float) -> None:
        for f in self._fixtures.values():
            if f.occupancy_remaining_s is not None:
                f.busy_until = now + f.occupancy_remaining_s
                f.occupancy_remaining_s = None
            if f.preview_remaining_s is not None:
                f.reserved_until = now + f.preview_remaining_s
                f.preview_remaining_s = None

    def _queue_copy(self) -> List[QueueItem]:
        with self._lock:
            return list(self._queue)

    def _init_fixtures_from_types(self, toilet_types: Sequence[str]) -> None:
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
            f.current_queue_item_id = None
            f.current_duration_s = None
            f.reserved = False
            f.reserved_until = None
            f.reserved_user_type = None
            f.reserved_queue_item_id = None
            f.reserved_duration_s = None
            f.preview_started_sim_s = None
            f.occupancy_remaining_s = None
            f.preview_remaining_s = None
            f.use_count = 0

    def _cancel_reservations_locked(
        self,
        predicate: Optional[Callable[[Fixture], bool]] = None,
    ) -> List[Dict[str, Any]]:
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
            fixture.preview_started_sim_s = None
        return cancelled

    def _eligible_free_indices(self) -> List[int]:
        free: List[int] = []
        for i in range(FIXTURE_COUNT):
            f = self._fixtures.get(i + 1)
            if f is None:
                continue
            if f.kind == "nonexistent":
                continue
            if f.in_use or f.reserved:
                continue
            if self._mode == MODE_SIM and not self._node_connections[i]:
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

    def _free_indices_by_kind(self, kind: str) -> List[int]:
        result: List[int] = []
        for i, t in enumerate(self._config.toilet_types):
            if str(t).lower() != kind:
                continue
            f = self._fixtures[i + 1]
            if f.kind == "nonexistent" or f.in_use or f.reserved:
                continue
            if self._mode == MODE_SIM and not self._node_connections[i]:
                continue
            result.append(i)
        return result

    def _reserve_fixture(
        self,
        pick_idx: int,
        head: QueueItem,
        now: float,
        shares: Dict[int, float],
    ) -> Dict[str, Any]:
        fixture = self._fixtures[pick_idx + 1]
        duration = head.duration_s or self._sample_duration(head.type)
        fixture.reserved = True
        fixture.reserved_until = now + PREVIEW_DURATION_S
        fixture.reserved_user_type = head.type
        fixture.reserved_queue_item_id = head.id
        fixture.reserved_duration_s = duration
        fixture.preview_started_sim_s = self._sim_time_s
        return {
            "queue_item_id": head.id,
            "user_type": head.type,
            "fixture_id": fixture.id,
            "fixture_kind": fixture.kind,
            "duration_s": duration,
            "reserved_until": fixture.reserved_until,
            "preview_duration_s": PREVIEW_DURATION_S,
            "sim_time_s": self._sim_time_s,
            "shares": {str(k + 1): v for k, v in shares.items()},
        }

    def _try_assign(self) -> None:
        if self._mode not in (MODE_DUMMY, MODE_SIM) or self._runtime != RUNTIME_RUNNING:
            return

        preview_events: List[Dict[str, Any]] = []
        exit_events: List[Dict[str, Any]] = []

        with self._lock:
            reserved_ids: set = {
                f.reserved_queue_item_id
                for f in self._fixtures.values()
                if f.reserved and f.reserved_queue_item_id is not None
            }

            now = time.time()
            conds = self._conditions_by_index()
            free_urinals = self._free_indices_by_kind("urinal")
            free_stalls = self._free_indices_by_kind("stall")

            # ---- urinal pass (non-shy pee users) ----
            for head in list(self._queue):
                if head.id in reserved_ids:
                    continue
                if head.type != "pee" or head.prefers_stall:
                    continue
                if not free_urinals:
                    break

                shares = compute_group_etiquette_shares(
                    toilet_types=self._config.toilet_types,
                    conditions_by_index=conds,
                    free_indices=free_urinals,
                    middle_pct=self._config.middle_toilet_first_choice_pct,
                    group_kind="urinal",
                )
                if not shares:
                    break

                pick_idx = pick_sequential(shares, conds, self._rng)
                if pick_idx is not None:
                    ev = self._reserve_fixture(pick_idx, head, now, shares)
                    preview_events.append(ev)
                    reserved_ids.add(head.id)
                    free_urinals.remove(pick_idx)
                else:
                    break 

            users_to_remove: List[QueueItem] = []
            for head in list(self._queue):
                if head.id in reserved_ids:
                    continue
                if head.type == "pee" and not head.prefers_stall:
                    if free_urinals:
                        continue 
                if not free_stalls:
                    break

                shares = compute_group_etiquette_shares(
                    toilet_types=self._config.toilet_types,
                    conditions_by_index=conds,
                    free_indices=free_stalls,
                    middle_pct=self._config.middle_toilet_first_choice_pct,
                    group_kind="stall",
                )
                if not shares:
                    break  

                pick_idx = pick_sequential(shares, conds, self._rng)
                if pick_idx is not None:
                    ev = self._reserve_fixture(pick_idx, head, now, shares)
                    preview_events.append(ev)
                    reserved_ids.add(head.id)
                    free_stalls.remove(pick_idx)
                else:
                    users_to_remove.append(head)
                    self._exited_users += 1
                    exit_events.append({"queue_item_id": head.id})

            if users_to_remove:
                remove_ids = {u.id for u in users_to_remove}
                self._queue[:] = [
                    q for q in self._queue if q.id not in remove_ids
                ]

        for ev in preview_events:
            self._emit("assignment_preview", ev)
        for ev in exit_events:
            self._emit("queue_item_exited", ev)
        if exit_events:
            self._emit(
                "queue_updated",
                {"queue": [q.to_dict() for q in self._queue_copy()]},
            )
        if preview_events or exit_events:
            self._emit_state()

    def _commit_reservations(self) -> None:
        dummy_events: List[Dict[str, Any]] = []
        sim_pending: List[Dict[str, Any]] = []
        queue_changed = False
        is_sim = False
        with self._lock:
            is_sim = self._mode == MODE_SIM
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
                if is_sim:
                    sim_pending.append({
                        "fixture": fixture,
                        "user_type": user_type,
                        "queue_item_id": queue_item_id,
                        "duration": duration,
                    })
                else:
                    fixture.reserved = False
                    fixture.reserved_until = None
                    fixture.reserved_user_type = None
                    fixture.reserved_queue_item_id = None
                    fixture.reserved_duration_s = None
                    fixture.preview_started_sim_s = None
                    fixture.in_use = True
                    fixture.busy_until = now + duration
                    fixture.current_user_type = user_type
                    fixture.current_queue_item_id = queue_item_id
                    fixture.current_duration_s = duration
                    if queue_item_id is not None:
                        for i, q in enumerate(self._queue):
                            if q.id == queue_item_id:
                                self._queue.pop(i)
                                queue_changed = True
                                break
                    dummy_events.append(
                        {
                            "queue_item_id": queue_item_id,
                            "user_type": user_type,
                            "fixture_id": fixture.id,
                            "fixture_kind": fixture.kind,
                            "duration_s": duration,
                            "busy_until": fixture.busy_until,
                        }
                    )

        sim_events: List[Dict[str, Any]] = []
        sim_cancelled: List[Dict[str, Any]] = []
        for item in sim_pending:
            fixture = item["fixture"]
            node_id = fixture.id
            qid = item["queue_item_id"]
            dur = item["duration"]
            payload = {
                "command": "SIM",
                "id": str(qid),
                "type": "NEW",
                "action": {"duration_s": round(dur, 1)},
            }
            ack_ok = False
            if self._send_to_node:
                try:
                    result = self._send_to_node(node_id, payload)
                    ack_ok = bool(result.get("ok"))
                    if not ack_ok:
                        log.warning(
                            "SIM NEW to node %d failed: %s",
                            node_id, result.get("error"),
                        )
                except Exception:
                    log.exception("SIM NEW to node %d raised", node_id)
            else:
                ack_ok = True

            with self._lock:
                if (
                    not fixture.reserved
                    or fixture.reserved_queue_item_id != qid
                ):
                    continue
                if ack_ok:
                    now_ack = time.time()
                    fixture.reserved = False
                    fixture.reserved_until = None
                    fixture.reserved_user_type = None
                    fixture.reserved_queue_item_id = None
                    fixture.reserved_duration_s = None
                    fixture.preview_started_sim_s = None
                    fixture.in_use = True
                    if self._runtime == RUNTIME_RUNNING:
                        fixture.busy_until = now_ack + dur
                    else:
                        fixture.busy_until = None
                        fixture.occupancy_remaining_s = dur
                    fixture.current_user_type = item["user_type"]
                    fixture.current_queue_item_id = qid
                    fixture.current_duration_s = dur
                    if qid is not None:
                        for i, q in enumerate(self._queue):
                            if q.id == qid:
                                self._queue.pop(i)
                                queue_changed = True
                                break
                    sim_events.append(
                        {
                            "queue_item_id": qid,
                            "user_type": item["user_type"],
                            "fixture_id": fixture.id,
                            "fixture_kind": fixture.kind,
                            "duration_s": dur,
                            "busy_until": fixture.busy_until,
                        }
                    )
                else:
                    fixture.reserved = False
                    fixture.reserved_until = None
                    fixture.reserved_user_type = None
                    fixture.reserved_queue_item_id = None
                    fixture.reserved_duration_s = None
                    fixture.preview_started_sim_s = None
                    sim_cancelled.append(
                        {
                            "queue_item_id": qid,
                            "fixture_id": fixture.id,
                            "fixture_kind": fixture.kind,
                            "user_type": item["user_type"],
                        }
                    )

        all_events = dummy_events + sim_events
        for ev in all_events:
            qid = ev.get("queue_item_id", "?")
            fid = ev.get("fixture_id", "?")
            server_log.publish_line(
                f"[SCHEDULER] sending user {qid} to toilet {fid}"
            )
            self._emit("assignment_started", ev)
        for ev in sim_cancelled:
            self._emit("assignment_preview_cancelled", ev)
        if queue_changed:
            self._emit(
                "queue_updated",
                {"queue": [q.to_dict() for q in self._queue_copy()]},
            )
        if all_events or sim_cancelled:
            self._emit_state()

    def _release_completed(self) -> None:
        released: List[Dict[str, Any]] = []
        with self._lock:
            if self._mode == MODE_SIM:
                return
            now = time.time()
            for fixture in self._fixtures.values():
                if (
                    fixture.in_use
                    and fixture.busy_until is not None
                    and fixture.busy_until <= now
                ):
                    user_type = fixture.current_user_type
                    q_done = fixture.current_queue_item_id
                    duration = fixture.current_duration_s
                    fixture.in_use = False
                    fixture.busy_until = None
                    fixture.current_user_type = None
                    fixture.current_queue_item_id = None
                    fixture.current_duration_s = None
                    fixture.use_count += 1
                    self._satisfied_users += 1
                    released.append(
                        {
                            "fixture_id": fixture.id,
                            "fixture_kind": fixture.kind,
                            "user_type": user_type,
                            "queue_item_id": q_done,
                            "satisfied_users": self._satisfied_users,
                            "duration_s": duration,
                            "restroom": restroom_from_preset(self._config.restroom_preset),
                            "mode": self._mode,
                            "success": True,
                        }
                    )
        for ev in released:
            qid = ev.get("queue_item_id")
            if qid is None:
                qid = "?"
            fid = ev.get("fixture_id", "?")
            server_log.publish_line(
                f"[SCHEDULER] user {qid} complete! Freeing toilet {fid}"
            )
            self._emit("assignment_completed", ev)
        if released:
            self._emit_state()

    def _expire_queue_timeouts(self) -> None:
        removed: List[Dict[str, Any]] = []
        with self._lock:
            if self._mode not in (MODE_DUMMY, MODE_SIM) or self._runtime != RUNTIME_RUNNING:
                return
            reserved_ids = {
                f.reserved_queue_item_id
                for f in self._fixtures.values()
                if f.reserved and f.reserved_queue_item_id is not None
            }
            kept: List[QueueItem] = []
            for q in self._queue:
                if q.id in reserved_ids:
                    kept.append(q)
                    continue
                if self._sim_time_s - q.enqueued_at_sim_s > QUEUE_WAIT_TIMEOUT_S:
                    self._exited_users += 1
                    removed.append({"queue_item_id": q.id})
                else:
                    kept.append(q)
            if len(kept) != len(self._queue):
                self._queue[:] = kept
        for ev in removed:
            qid = ev.get("queue_item_id")
            if qid is not None:
                server_log.publish_line(
                    f"[SCHEDULER] user {qid} timed out; Removing from queue"
                )
            self._emit("queue_item_exited", ev)
        if removed:
            self._emit(
                "queue_updated",
                {"queue": [q.to_dict() for q in self._queue_copy()]},
            )
            self._emit_state()

    def notify_complete(self, node_id: int, user_id: Optional[str] = None, success: bool = True) -> Dict[str, Any]:
        released: Optional[Dict[str, Any]] = None
        with self._lock:
            if self._mode != MODE_SIM:
                return {"ok": False, "error": "not in SIM mode"}
            fixture = self._fixtures.get(node_id)
            if fixture is None or not fixture.in_use:
                return {"ok": False, "error": f"fixture {node_id} not in use"}
            q_id = fixture.current_queue_item_id
            user_type = fixture.current_user_type
            duration = fixture.current_duration_s
            fixture.in_use = False
            fixture.busy_until = None
            fixture.occupancy_remaining_s = None
            fixture.current_user_type = None
            fixture.current_queue_item_id = None
            fixture.current_duration_s = None
            fixture.use_count += 1
            if success:
                self._satisfied_users += 1
            else:
                self._exited_users += 1
            released = {
                "fixture_id": node_id,
                "fixture_kind": fixture.kind,
                "user_type": user_type,
                "queue_item_id": q_id,
                "satisfied_users": self._satisfied_users,
                "duration_s": duration,
                "restroom": restroom_from_preset(self._config.restroom_preset),
                "mode": self._mode,
                "success": success,
            }
        server_log.publish_line(
            f"[SCHEDULER] user {q_id} complete! Freeing toilet {node_id}"
        )
        self._emit("assignment_completed", released)
        self._emit_state()
        self._try_assign()
        return {"ok": True}

    def _publish_pause_summary(self) -> None:
        with self._lock:
            sim_s = self._sim_time_s
            satisfied = self._satisfied_users
            exited = self._exited_users
            total = self._total_arrivals
            fixtures = [
                (f.id, f.kind, f.use_count) for f in self._fixtures.values()
                if f.kind != "nonexistent"
            ]
        m = int(sim_s) // 60
        s = int(sim_s) % 60
        elapsed = f"{m}m {s}s" if m else f"{s}s"
        total_uses = sum(uc for _, _, uc in fixtures)
        server_log.publish_line("=============== PAUSE ===============")
        server_log.publish_line(f"  Elapsed: {elapsed}")
        server_log.publish_line(f"  Satisfied Users: {satisfied}")
        server_log.publish_line(f"  Exited Users: {exited}")
        server_log.publish_line(f"  Total Users: {total}")
        for fid, kind, uc in fixtures:
            pct = f"{uc / total_uses * 100:.0f}%" if total_uses > 0 else "0%"
            server_log.publish_line(
                f"  {kind.capitalize()} {fid}: {uc} uses ({pct})"
            )

    def _emit_state(self) -> None:
        self._emit("scheduler_state", self.snapshot())

    def _run(self) -> None:
        log.info("scheduler tick thread started")
        while not self._stop.is_set():
            try:
                now = time.time()
                with self._lock:
                    if self._last_tick_wall is None:
                        self._last_tick_wall = now
                    else:
                        dt = max(0.0, min(now - self._last_tick_wall, 1.0))
                        self._last_tick_wall = now
                        if (
                            self._mode in (MODE_DUMMY, MODE_SIM)
                            and self._runtime == RUNTIME_RUNNING
                            and dt > 0
                        ):
                            self._sim_time_s += dt
                if self._mode in (MODE_DUMMY, MODE_SIM) and self._runtime == RUNTIME_RUNNING:
                    self._release_completed()
                    self._commit_reservations()
                    self._try_assign()
                    self._expire_queue_timeouts()
            except Exception:
                log.exception("scheduler tick raised")
            self._stop.wait(TICK_INTERVAL_S)
        log.info("scheduler tick thread stopped")


_PRESET_TO_RESTROOM = {
    "maclean_2m": "maclean_f2_mens",
    "seamen_1m": "seamans_f1_mens",
}


def restroom_from_preset(preset_id: str) -> str:
    """Map a restroom preset id (e.g. ``maclean_2m``) to its Influx restroom tag."""
    return _PRESET_TO_RESTROOM.get(preset_id, preset_id)


def _normalise_toilet_types(types: Iterable[str]) -> List[str]:
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
    "QUEUE_WAIT_TIMEOUT_S",
    "MODE_SIM",
    "MODE_TEST",
    "MODE_DUMMY",
    "VALID_MODES",
    "RUNTIME_STOPPED",
    "RUNTIME_PAUSED",
    "RUNTIME_RUNNING",
    "VALID_RUNTIMES",
    "API_SIM_USER_RUNTIMES",
    "restroom_from_preset",
]
