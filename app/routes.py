from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, Response, current_app, jsonify, request

from .dummy_generator import generate_dummy_usage_events
from .influx_contract import normalize_usage_payload
from .models import AssignmentStatus, iso_now

api = Blueprint("api", __name__)


def _error(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def _require_api_token() -> tuple[dict, int] | None:
    expected = current_app.config.get("API_AUTH_TOKEN", "")
    if not expected:
        return None
    provided = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if provided != expected:
        return _error("unauthorized", "missing or invalid api token", 401)
    return None


def _require_node_token() -> tuple[dict, int] | None:
    expected = current_app.config.get("NODE_AUTH_TOKEN", "")
    if not expected:
        return None
    provided = request.headers.get("X-Node-Token", "").strip()
    if provided != expected:
        return _error("unauthorized_node", "missing or invalid node token", 401)
    return None


def _save_snapshot() -> None:
    current_app.extensions["snapshot_store"].save(current_app.extensions["state"].snapshot())


@api.get("/health/live")
def health_live():
    return jsonify({"status": "ok", "timestamp": iso_now()})


@api.get("/health/ready")
def health_ready():
    return jsonify({"status": "ready", "timestamp": iso_now()})


@api.get("/api/v1/state")
def get_state():
    return jsonify(current_app.extensions["state"].snapshot())


@api.get("/api/v1/config")
def get_config():
    return jsonify(asdict(current_app.extensions["state"].config))


@api.put("/api/v1/config")
def put_config():
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    cfg = current_app.extensions["state"].update_config(payload)
    event = current_app.extensions["event_bus"].publish("CONFIG_UPDATED", asdict(cfg))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    _save_snapshot()
    return jsonify(asdict(cfg))


@api.post("/api/v1/demand/delta")
def post_demand_delta():
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    pee_delta = int(payload.get("pee_delta", 0))
    poo_delta = int(payload.get("poo_delta", 0))
    idempotency_key = request.headers.get("Idempotency-Key")
    queue = current_app.extensions["state"].apply_queue_delta(
        pee_delta=pee_delta,
        poo_delta=poo_delta,
        idempotency_key=idempotency_key,
    )
    event = current_app.extensions["event_bus"].publish("QUEUE_UPDATED", asdict(queue))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    current_app.extensions["scheduler"].schedule_tick()
    _save_snapshot()
    return jsonify(asdict(queue))


@api.post("/api/v1/incidents")
def create_incident():
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    incident = current_app.extensions["state"].create_incident(
        scope=payload.get("scope", "node"),
        node_id=payload.get("node_id"),
        incident_type=payload.get("incident_type", "manual_block"),
        severity=payload.get("severity", "med"),
        notes=payload.get("notes", ""),
    )
    event = current_app.extensions["event_bus"].publish("INCIDENT_OPENED", asdict(incident))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    current_app.extensions["persistence"].write_incident(asdict(incident))
    current_app.extensions["scheduler"].schedule_tick()
    _save_snapshot()
    return jsonify(asdict(incident)), 201


@api.patch("/api/v1/incidents/<incident_id>")
def resolve_incident(incident_id: str):
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    incident = current_app.extensions["state"].resolve_incident(incident_id, notes=payload.get("notes", ""))
    event = current_app.extensions["event_bus"].publish("INCIDENT_RESOLVED", asdict(incident))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    current_app.extensions["persistence"].write_incident(asdict(incident))
    current_app.extensions["scheduler"].schedule_tick()
    _save_snapshot()
    return jsonify(asdict(incident))


@api.get("/api/v1/incidents")
def list_incidents():
    status = request.args.get("status")
    incidents = list(current_app.extensions["state"].incidents.values())
    if status:
        incidents = [item for item in incidents if item.status.value == status]
    return jsonify([asdict(item) for item in incidents])


@api.get("/api/v1/nodes")
def list_nodes():
    return jsonify([asdict(item) for item in current_app.extensions["state"].nodes.values()])


@api.post("/api/v1/nodes/register")
def register_node():
    auth = _require_node_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    node = current_app.extensions["state"].register_node(
        node_id=payload["node_id"],
        fixture_type=payload.get("fixture_type", "stall"),
        metadata=payload.get("metadata", {}),
    )
    event = current_app.extensions["event_bus"].publish("NODE_STATUS_CHANGED", asdict(node))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    current_app.extensions["scheduler"].schedule_tick()
    _save_snapshot()
    return jsonify(asdict(node)), 201


@api.post("/api/v1/nodes/<node_id>/heartbeat")
def node_heartbeat(node_id: str):
    auth = _require_node_token()
    if auth:
        return auth
    payload = request.get_json(silent=True) or {}
    node = current_app.extensions["state"].heartbeat(node_id=node_id, status=payload.get("status"))
    event = current_app.extensions["event_bus"].publish("NODE_STATUS_CHANGED", asdict(node))
    current_app.extensions["persistence"].write_event(event.event_type, event.payload)
    _save_snapshot()
    return jsonify(asdict(node))


@api.post("/api/v1/nodes/<node_id>/ack-start")
def ack_start(node_id: str):
    auth = _require_node_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    assignment_id = payload["assignment_id"]
    assignment = current_app.extensions["state"].assignments.get(assignment_id)
    if not assignment or assignment.node_id != node_id:
        return _error("not_found", "assignment not found", 404)
    current_app.extensions["scheduler"].ack_started(assignment_id)
    _save_snapshot()
    return jsonify({"status": AssignmentStatus.STARTED.value})


@api.post("/api/v1/nodes/<node_id>/ack-done")
def ack_done(node_id: str):
    auth = _require_node_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    assignment_id = payload["assignment_id"]
    assignment = current_app.extensions["state"].assignments.get(assignment_id)
    if not assignment or assignment.node_id != node_id:
        return _error("not_found", "assignment not found", 404)
    current_app.extensions["scheduler"].ack_done(assignment_id)
    _save_snapshot()
    return jsonify({"status": AssignmentStatus.DONE.value})


@api.post("/api/v1/nodes/<node_id>/ack-fail")
def ack_fail(node_id: str):
    auth = _require_node_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    assignment_id = payload["assignment_id"]
    reason = payload.get("reason", "")
    assignment = current_app.extensions["state"].assignments.get(assignment_id)
    if not assignment or assignment.node_id != node_id:
        return _error("not_found", "assignment not found", 404)
    current_app.extensions["scheduler"].ack_failed(assignment_id, reason=reason)
    _save_snapshot()
    return jsonify({"status": AssignmentStatus.FAILED.value})


@api.get("/api/v1/stream")
def stream():
    last_sequence = int(request.args.get("last_sequence", "0"))
    response = Response(
        current_app.extensions["event_bus"].sse_stream(last_sequence=last_sequence),
        mimetype="text/event-stream",
    )
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@api.post("/api/v1/simulation/usage")
def ingest_simulation_usage():
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    source = str(payload.get("source", "simulation")).strip() or "simulation"
    raw_events = payload.get("events")
    if raw_events is None:
        raw_events = [payload]
    if not isinstance(raw_events, list) or not raw_events:
        return _error("invalid_payload", "events must be a non-empty list", 400)

    normalized: list[dict] = []
    for index, event in enumerate(raw_events):
        if not isinstance(event, dict):
            return _error("invalid_payload", f"events[{index}] must be an object", 400)
        try:
            record = normalize_usage_payload(event, source=source)
        except ValueError as exc:
            return _error("invalid_payload", str(exc), 400)
        usage_payload = record.as_payload()
        current_app.extensions["persistence"].write_restroom_usage(usage_payload)
        current_app.extensions["persistence"].write_simulation_event(
            "USAGE_INGESTED",
            usage_payload,
        )
        normalized.append(usage_payload)

    return jsonify({"ingested": len(normalized), "events": normalized}), 201


@api.post("/api/v1/simulation/dummy/generate")
def generate_dummy_usage():
    auth = _require_api_token()
    if auth:
        return auth
    payload = request.get_json(force=True) or {}
    try:
        count = int(payload.get("count", 25))
    except Exception:
        return _error("invalid_payload", "count must be an integer", 400)
    if count <= 0 or count > 2000:
        return _error("invalid_payload", "count must be between 1 and 2000", 400)
    restroom = payload.get("restroom")
    seed = payload.get("seed")
    if seed is not None:
        try:
            seed = int(seed)
        except Exception:
            return _error("invalid_payload", "seed must be an integer", 400)
    raw_events = generate_dummy_usage_events(count=count, restroom_id=restroom, seed=seed)

    normalized: list[dict] = []
    for raw_event in raw_events:
        try:
            record = normalize_usage_payload(raw_event, source="dummy")
        except ValueError as exc:
            return _error("invalid_payload", str(exc), 400)
        usage_payload = record.as_payload()
        current_app.extensions["persistence"].write_restroom_usage(usage_payload)
        current_app.extensions["persistence"].write_simulation_event(
            "DUMMY_USAGE_GENERATED",
            usage_payload,
        )
        normalized.append(usage_payload)

    return jsonify({"generated": len(normalized), "events": normalized}), 201

