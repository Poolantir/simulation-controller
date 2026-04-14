from __future__ import annotations

import os
import threading
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from .events import EventBus
from .node_transport import MockNodeTransport
from .persistence import create_persistence_writer
from .recovery import SnapshotStore
from .routes import api
from .scheduler import SchedulerService
from .security import RateLimiter
from .state import RuntimeState


def create_app() -> Flask:
    load_dotenv()
    app = Flask(__name__)

    state = RuntimeState()
    event_bus = EventBus()
    transport = MockNodeTransport()
    persistence = create_persistence_writer()
    scheduler = SchedulerService(
        state=state,
        event_bus=event_bus,
        transport=transport,
        persistence=persistence,
    )

    app.extensions["state"] = state
    app.extensions["event_bus"] = event_bus
    app.extensions["transport"] = transport
    app.extensions["persistence"] = persistence
    app.extensions["scheduler"] = scheduler

    snapshot_path = os.getenv("STATE_SNAPSHOT_PATH", ".runtime/state_snapshot.json")
    snapshot_store = SnapshotStore(snapshot_path)
    app.extensions["snapshot_store"] = snapshot_store
    loaded = snapshot_store.load()
    if loaded:
        state.load_snapshot(loaded)

    limiter = RateLimiter(
        max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120")),
        window_sec=int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60")),
    )
    app.extensions["rate_limiter"] = limiter

    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH_BYTES", "65536"))
    app.config["API_AUTH_TOKEN"] = os.getenv("API_AUTH_TOKEN", "").strip()
    app.config["NODE_AUTH_TOKEN"] = os.getenv("NODE_AUTH_TOKEN", "").strip()
    app.config["ALLOWED_ORIGIN"] = os.getenv("ALLOWED_ORIGIN", "").strip()

    app.register_blueprint(api)
    _register_global_hooks(app)
    _start_watchdog(app)
    return app


def _register_global_hooks(app: Flask) -> None:
    @app.before_request
    def _before_request():
        if request.path.startswith("/health/"):
            return None
        limiter: RateLimiter = app.extensions["rate_limiter"]
        key = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")
        if not limiter.allow(key):
            return jsonify({"error": {"code": "rate_limited", "message": "Too many requests"}}), 429
        return None

    @app.after_request
    def _after_request(response):
        origin = app.config.get("ALLOWED_ORIGIN", "")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
        return response


def _start_watchdog(app: Flask) -> None:
    interval = int(os.getenv("WATCHDOG_INTERVAL_SEC", "5"))

    def run() -> None:
        while True:
            with app.app_context():
                app.extensions["scheduler"].watchdog()
                app.extensions["snapshot_store"].save(app.extensions["state"].snapshot())
            time.sleep(interval)

    thread = threading.Thread(target=run, daemon=True, name="scheduler-watchdog")
    thread.start()


if __name__ == "__main__":
    app = create_app()
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    app.run(host=host, port=port, debug=True, threaded=True)

