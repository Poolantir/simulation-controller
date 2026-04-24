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
import threading
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from ble_manager import BleManager  # noqa: E402

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("server")

app = Flask(__name__)
CORS(app)

ble = BleManager()
ble.start()


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
    """

    client_q: "queue.Queue[tuple[str, Any]]" = queue.Queue(maxsize=128)

    def on_status(snap: Dict[int, Dict[str, Any]]) -> None:
        try:
            client_q.put_nowait(("status", snap))
        except queue.Full:
            pass

    def on_inbound(node_id: int, payload: Any, raw: str) -> None:
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
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


@app.route("/api/nodes/<int:node_id>/connect", methods=["POST"])
def nodes_connect(node_id: int) -> Any:
    result = ble.request_connect(node_id)
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


@app.route("/api/nodes/<int:node_id>/disconnect", methods=["POST"])
def nodes_disconnect(node_id: int) -> Any:
    result = ble.request_disconnect(node_id)
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


if __name__ == "__main__":
    port = int(os.getenv("API_PORT", "5001"))
    # threaded=True lets SSE streams coexist with regular requests
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False, use_reloader=False)
