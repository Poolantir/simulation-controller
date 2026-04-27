"""
Poolantir Flask API.

Runs on the host (not Docker) so the BLE manager can reach the Mac's
Bluetooth radio via bleak/CoreBluetooth.
"""

from __future__ import annotations

import json
import logging
import os
import queue
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from ble_manager import BleManager  # noqa: E402
from scheduler import (  # noqa: E402
    API_SIM_USER_RUNTIMES,
    MODE_SIM,
    MODE_TEST,
    MODE_DUMMY,
    Scheduler,
    VALID_MODES,
)
import server_log  # noqa: E402

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("server")

app = Flask(__name__)
CORS(app)

ble = BleManager()
ble.start()

scheduler = Scheduler(send_to_node=ble.send)
scheduler.start()


def _sync_node_connections(snap: Dict[int, Dict[str, Any]]) -> None:
    """Keep the scheduler's node-connection list in sync with BLE status."""
    conns = [False] * 6
    for nid, info in snap.items():
        if isinstance(nid, int) and 1 <= nid <= 6:
            conns[nid - 1] = bool(info.get("connected"))
    scheduler.set_node_connections(conns)


def _handle_sim_complete(node_id: int, payload: Any, raw: str) -> None:
    """Forward ESP32 SIM COMPLETE notifications to the scheduler."""
    if not isinstance(payload, dict):
        return
    if str(payload.get("command", "")).upper() != "SIM":
        return
    if str(payload.get("type", "")).upper() != "COMPLETE":
        return
    action = payload.get("action", {})
    success = True
    if isinstance(action, dict):
        success = bool(action.get("success", True))
    elif isinstance(action, bool):
        success = action
    scheduler.notify_complete(node_id, user_id=str(payload.get("id", "")), success=success)


ble.subscribe(_sync_node_connections)
ble.subscribe_inbound(_handle_sim_complete)


def _normalize_get_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce GET / SERVO_RAMP|IN_RANGE RX so `action` is always a number for clients.

    ESP32 may send (COMMANDS.md):
      {"command":"GET","id":"","type":"SERVO_RAMP","action":{"SERVO_RAMP": 2000}}
      {"command":"GET","id":"","type":"IN_RANGE","action":{"IN_RANGE": 60}}
    or a bare numeric `action` (legacy).
    """
    if str(payload.get("command", "")).upper() != "GET":
        return payload
    typ = str(payload.get("type", "")).upper()
    if typ not in ("SERVO_RAMP", "IN_RANGE"):
        return payload
    action = payload.get("action")
    if isinstance(action, (int, float)) and not isinstance(action, bool):
        return payload
    if not isinstance(action, dict):
        return payload
    key = "SERVO_RAMP" if typ == "SERVO_RAMP" else "IN_RANGE"
    val: Any = action.get(key)
    if val is None:
        for v in action.values():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                val = v
                break
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        out = dict(payload)
        if isinstance(val, float) and not val.is_integer():
            out["action"] = val
        else:
            out["action"] = int(val)
        return out
    return payload


@app.route("/health")
def health() -> Any:
    return jsonify(status="ok")


@app.route("/api/nodes/status")
def nodes_status() -> Any:
    return jsonify(ble.snapshot())


@app.route("/api/nodes/stream")
def nodes_stream() -> Response:
    """SSE: push status snapshots + node->server notifications.

    Emits two event types:
      - `status`: full connection snapshot whenever it changes.
      - `inbound`: `{node_id, payload, raw}` for each BLE notification.
        GET (SERVO_RAMP / IN_RANGE) responses are normalized so `action` is numeric.
    """

    client_q: "queue.Queue[tuple[str, Any]]" = queue.Queue(maxsize=128)

    def on_status(snap: Dict[int, Dict[str, Any]]) -> None:
        try:
            client_q.put_nowait(("status", snap))
        except queue.Full:
            pass

    def on_inbound(node_id: int, payload: Any, raw: str) -> None:
        if isinstance(payload, dict):
            payload = _normalize_get_response(payload)
        evt = {"node_id": node_id, "payload": payload, "raw": raw}
        try:
            client_q.put_nowait(("inbound", evt))
        except queue.Full:
            pass

    unsub_status = ble.subscribe(on_status)
    unsub_inbound = ble.subscribe_inbound(on_inbound)

    def gen():
        try:
            yield _sse("status", ble.snapshot())
            while True:
                try:
                    event, data = client_q.get(timeout=15.0)
                    yield _sse(event, data)
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            unsub_status()
            unsub_inbound()

    return Response(
        gen(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/api/nodes/<int:node_id>/send", methods=["POST"])
def nodes_send(node_id: int) -> Any:
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify(ok=False, error="body must be a JSON object"), 400
    result = ble.send(node_id, payload)
    if result.get("ok"):
        compact = json.dumps(payload, separators=(",", ":"))
        uid = payload.get("id")
        if uid is not None:
            server_log.publish_line(
                f"[SERVER -> Node {node_id}] (user_id={uid}): {compact}"
            )
        else:
            server_log.publish_line(f"[SERVER -> Node {node_id}]: {compact}")
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


@app.route("/api/nodes/<int:node_id>/connect", methods=["POST"])
def nodes_connect(node_id: int) -> Any:
    result = ble.request_connect(node_id)
    if result.get("ok") and result.get("connected"):
        for param_type in ("SERVO_RAMP", "IN_RANGE"):
            get_payload = {"command": "GET", "id": "", "type": param_type, "action": ""}
            ble.send(node_id, get_payload, timeout=3.0)
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


@app.route("/api/nodes/<int:node_id>/disconnect", methods=["POST"])
def nodes_disconnect(node_id: int) -> Any:
    result = ble.request_disconnect(node_id)
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


# ---------------------------------------------------------------------
# Dummy Mode scheduler API
# ---------------------------------------------------------------------


@app.route("/api/scheduler/state")
def scheduler_state() -> Any:
    return jsonify(ok=True, state=scheduler.snapshot())


@app.route("/api/scheduler/sim_runtime", methods=["POST"])
def scheduler_sim_runtime() -> Any:
    """Play / Pause for Dummy mode (see `Scheduler.set_sim_runtime`)."""
    payload = request.get_json(silent=True) or {}
    rt = str(payload.get("runtime", "")).lower()
    if rt not in API_SIM_USER_RUNTIMES:
        return (
            jsonify(
                ok=False, error=f"runtime must be one of {list(API_SIM_USER_RUNTIMES)}"
            ),
            400,
        )
    result = scheduler.set_sim_runtime(rt)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/scheduler/mode", methods=["POST"])
def scheduler_mode() -> Any:
    payload = request.get_json(silent=True) or {}
    mode = str(payload.get("mode", "")).upper()
    if mode not in VALID_MODES:
        return (
            jsonify(ok=False, error=f"mode must be one of {list(VALID_MODES)}"),
            400,
        )
    result = scheduler.set_mode(mode)
    if result.get("ok"):
        label = "SIMULATION" if mode == MODE_SIM else "TESTING"
        server_log.publish_line(f"=============== SET: {label} ===============")
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/scheduler/config", methods=["POST"])
def scheduler_config() -> Any:
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify(ok=False, error="body must be a JSON object"), 400
    result = scheduler.set_config(
        restroom_preset=payload.get("restroom_preset"),
        toilet_types=payload.get("toilet_types"),
        shy_peer_pct=payload.get("shy_peer_pct"),
        middle_toilet_first_choice_pct=payload.get("middle_toilet_first_choice_pct"),
        restroom_conditions=payload.get("restroom_conditions"),
    )
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/scheduler/enqueue", methods=["POST"])
def scheduler_enqueue() -> Any:
    payload = request.get_json(silent=True) or {}
    user_type = str(payload.get("type", "")).lower()
    result = scheduler.enqueue(user_type)
    if result.get("ok"):
        item = result.get("item", {})
        dur = item.get("duration_s")
        dur_text = f"{dur:.1f}s" if dur is not None else "?"
        uid = item.get("id", "?")
        server_log.publish_line(
            f'[QUEUE]: Added (user_id: {uid}, use: {item.get("type", user_type)}, duration: {dur_text})'
        )
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/scheduler/sample_duration", methods=["POST"])
def scheduler_sample_duration() -> Any:
    """Sample a pee/poo duration without enqueuing anyone.

    Used by non-Dummy modes (SIM) so queued users can be labeled with
    backend-authoritative per-user durations that match the Dummy
    scheduler's sampling distribution.
    """
    payload = request.get_json(silent=True) or {}
    user_type = str(payload.get("type", "")).lower()
    result = scheduler.sample_duration(user_type)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/scheduler/queue/clear", methods=["POST"])
def scheduler_queue_clear() -> Any:
    result = scheduler.clear_queue()
    if result.get("ok"):
        server_log.publish_line("[QUEUE]: Cleared Queue")
    return jsonify(result)


@app.route("/api/scheduler/reset", methods=["POST"])
def scheduler_reset() -> Any:
    return jsonify(scheduler.reset())


@app.route("/api/server-log", methods=["POST"])
def server_log_post() -> Any:
    """Accept a client-originated log line (SIM queue actions)."""
    payload = request.get_json(silent=True) or {}
    line = payload.get("line")
    if not isinstance(line, str) or not line or len(line) > 500:
        return jsonify(ok=False, error="line must be a non-empty string (max 500)"), 400
    server_log.publish_line(line)
    return jsonify(ok=True)


@app.route("/api/scheduler/stream")
def scheduler_stream() -> Response:
    """SSE stream of scheduler events + server_log lines.

    Emits `scheduler_state` as a full snapshot on connect, followed by
    per-event frames as state changes:
      - `scheduler_state`  — full snapshot (on major changes)
      - `queue_updated`    — after enqueue / clear / assignment
      - `assignment_started` — a queued user was placed on a fixture
      - `assignment_completed` — a fixture finished its busy window
      - `mode_changed`     — SIM/TEST/DUMMY switch
      - `config_updated`   — preset/percentages/cleanliness changed
      - `reset`            — full reset
      - `server_log`       — spec-formatted log line (LOGGING.md)
    """

    client_q: "queue.Queue[tuple[str, Any]]" = queue.Queue(maxsize=256)

    def on_event(event: str, data: Dict[str, Any]) -> None:
        try:
            client_q.put_nowait((event, data))
        except queue.Full:
            try:
                client_q.get_nowait()
                client_q.put_nowait((event, data))
            except queue.Empty:
                pass

    def on_log_line(line: str) -> None:
        try:
            client_q.put_nowait(("server_log", {"line": line}))
        except queue.Full:
            pass

    unsub_sched = scheduler.subscribe(on_event)
    unsub_log = server_log.subscribe(on_log_line)

    def gen():
        try:
            yield _sse("scheduler_state", scheduler.snapshot())
            for line in server_log.replay():
                yield _sse("server_log", {"line": line})
            while True:
                try:
                    event, data = client_q.get(timeout=15.0)
                    yield _sse(event, data)
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            unsub_sched()
            unsub_log()

    return Response(
        gen(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


if __name__ == "__main__":
    port = int(os.getenv("API_PORT", "5001"))
    # threaded=True lets SSE streams coexist with regular requests
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False, use_reloader=False)
