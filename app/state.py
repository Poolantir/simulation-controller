from __future__ import annotations

import threading
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from .models import (
    Assignment,
    AssignmentStatus,
    BathroomConfig,
    DemandQueue,
    FixtureType,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    Node,
    NodeStatus,
    UsageType,
    iso_now,
    new_assignment_id,
    new_incident_id,
)


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def iso_from_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


class RuntimeState:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.config = BathroomConfig()
        self.queue = DemandQueue()
        self.nodes: dict[str, Node] = {}
        self.assignments: dict[str, Assignment] = {}
        self.incidents: dict[str, Incident] = {}
        self.processed_idempotency_keys: dict[str, str] = {}

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "config": asdict(self.config),
                "queue": asdict(self.queue),
                "nodes": [asdict(node) for node in self.nodes.values()],
                "assignments": [asdict(item) for item in self.assignments.values()],
                "incidents": [asdict(item) for item in self.incidents.values()],
                "idempotency_keys": dict(self.processed_idempotency_keys),
                "server_time": iso_now(),
            }

    def load_snapshot(self, payload: dict[str, Any]) -> None:
        with self._lock:
            if "config" in payload:
                self.config = BathroomConfig(**payload["config"])
            if "queue" in payload:
                self.queue = DemandQueue(**payload["queue"])
            if "nodes" in payload:
                self.nodes = {item["node_id"]: Node(**item) for item in payload["nodes"]}
            if "assignments" in payload:
                self.assignments = {
                    item["assignment_id"]: Assignment(**item) for item in payload["assignments"]
                }
            if "incidents" in payload:
                self.incidents = {item["incident_id"]: Incident(**item) for item in payload["incidents"]}
            self.processed_idempotency_keys = payload.get("idempotency_keys", {})

    def update_config(self, payload: dict[str, Any]) -> BathroomConfig:
        with self._lock:
            next_cfg = BathroomConfig(
                bathroom_id=payload.get("bathroom_id", self.config.bathroom_id),
                stalls=int(payload.get("stalls", self.config.stalls)),
                urinals=int(payload.get("urinals", self.config.urinals)),
                pee_duration_sec=int(payload.get("pee_duration_sec", self.config.pee_duration_sec)),
                poo_duration_sec=int(payload.get("poo_duration_sec", self.config.poo_duration_sec)),
                updated_at=iso_now(),
            )
            next_cfg.validate()
            self.config = next_cfg
            return self.config

    def apply_queue_delta(self, pee_delta: int, poo_delta: int, idempotency_key: str | None = None) -> DemandQueue:
        with self._lock:
            if idempotency_key and idempotency_key in self.processed_idempotency_keys:
                return self.queue
            self.queue.apply_delta(pee_delta=pee_delta, poo_delta=poo_delta)
            if idempotency_key:
                self.processed_idempotency_keys[idempotency_key] = iso_now()
                if len(self.processed_idempotency_keys) > 5000:
                    oldest = sorted(self.processed_idempotency_keys.items(), key=lambda item: item[1])[:500]
                    for key, _ in oldest:
                        self.processed_idempotency_keys.pop(key, None)
            return self.queue

    def register_node(self, node_id: str, fixture_type: str, metadata: dict | None = None) -> Node:
        with self._lock:
            node = self.nodes.get(node_id)
            if node:
                node.fixture_type = FixtureType(fixture_type)
                node.status = NodeStatus.ONLINE
                node.last_heartbeat_at = iso_now()
                if metadata:
                    node.metadata.update(metadata)
                return node
            node = Node(
                node_id=node_id,
                fixture_type=FixtureType(fixture_type),
                status=NodeStatus.ONLINE,
                metadata=metadata or {},
            )
            self.nodes[node_id] = node
            return node

    def heartbeat(self, node_id: str, status: str | None = None) -> Node:
        with self._lock:
            node = self.nodes[node_id]
            node.last_heartbeat_at = iso_now()
            if status:
                node.status = NodeStatus(status)
            return node

    def mark_offline_timeouts(self, heartbeat_timeout_sec: int = 20) -> list[Node]:
        stale_nodes: list[Node] = []
        threshold = datetime.now(timezone.utc) - timedelta(seconds=heartbeat_timeout_sec)
        with self._lock:
            for node in self.nodes.values():
                last = parse_iso(node.last_heartbeat_at)
                if node.status != NodeStatus.OFFLINE and last < threshold:
                    node.status = NodeStatus.OFFLINE
                    node.active_assignment_id = None
                    stale_nodes.append(node)
        return stale_nodes

    def create_incident(
        self,
        scope: str,
        node_id: str | None,
        incident_type: str,
        severity: str,
        notes: str = "",
    ) -> Incident:
        with self._lock:
            incident = Incident(
                incident_id=new_incident_id(),
                scope=scope,
                node_id=node_id,
                incident_type=IncidentType(incident_type),
                severity=IncidentSeverity(severity),
                notes=notes,
            )
            self.incidents[incident.incident_id] = incident
            if node_id and node_id in self.nodes:
                self.nodes[node_id].status = NodeStatus.OUT_OF_ORDER
            return incident

    def resolve_incident(self, incident_id: str, notes: str = "") -> Incident:
        with self._lock:
            incident = self.incidents[incident_id]
            incident.status = IncidentStatus.RESOLVED
            incident.resolved_at = iso_now()
            if notes:
                incident.notes = notes
            if incident.node_id and incident.node_id in self.nodes:
                node = self.nodes[incident.node_id]
                if node.status == NodeStatus.OUT_OF_ORDER:
                    node.status = NodeStatus.ONLINE
            return incident

    def create_assignment(self, node_id: str, usage_type: UsageType) -> Assignment:
        with self._lock:
            start_dt = datetime.now(timezone.utc)
            duration = self.config.pee_duration_sec if usage_type == UsageType.PEE else self.config.poo_duration_sec
            end_dt = start_dt + timedelta(seconds=duration)
            assignment = Assignment(
                assignment_id=new_assignment_id(),
                node_id=node_id,
                usage_type=usage_type,
                scheduled_start_at=iso_from_dt(start_dt),
                scheduled_end_at=iso_from_dt(end_dt),
            )
            self.assignments[assignment.assignment_id] = assignment
            node = self.nodes[node_id]
            node.status = NodeStatus.BUSY
            node.active_assignment_id = assignment.assignment_id
            node.next_available_at = assignment.scheduled_end_at
            if usage_type == UsageType.PEE:
                self.queue.pending_pee -= 1
            else:
                self.queue.pending_poo -= 1
            self.queue.updated_at = iso_now()
            return assignment

    def update_assignment_status(self, assignment_id: str, status: AssignmentStatus) -> Assignment:
        with self._lock:
            assignment = self.assignments[assignment_id]
            assignment.status = status
            assignment.updated_at = iso_now()
            node = self.nodes[assignment.node_id]
            if status in {AssignmentStatus.DONE, AssignmentStatus.FAILED, AssignmentStatus.CANCELLED}:
                node.active_assignment_id = None
                if node.status != NodeStatus.OUT_OF_ORDER:
                    node.status = NodeStatus.ONLINE
                    node.next_available_at = iso_now()
            return assignment

    def increment_assignment_retry(self, assignment_id: str) -> Assignment:
        with self._lock:
            assignment = self.assignments[assignment_id]
            assignment.retries += 1
            assignment.updated_at = iso_now()
            return assignment

