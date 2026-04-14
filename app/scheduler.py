from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from .events import EventBus
from .models import AssignmentStatus, NodeStatus, UsageType
from .node_transport import NodeTransport
from .persistence import PersistenceWriter
from .state import RuntimeState, parse_iso


class SchedulerService:
    def __init__(
        self,
        state: RuntimeState,
        event_bus: EventBus,
        transport: NodeTransport,
        persistence: PersistenceWriter,
        max_retries: int = 2,
    ) -> None:
        self.state = state
        self.event_bus = event_bus
        self.transport = transport
        self.persistence = persistence
        self.max_retries = max_retries

    def _eligible_nodes(self, usage_type: UsageType) -> list[str]:
        now = datetime.now(timezone.utc)
        eligible: list[str] = []
        for node in self.state.nodes.values():
            if node.status in {NodeStatus.OFFLINE, NodeStatus.OUT_OF_ORDER, NodeStatus.BUSY}:
                continue
            next_at = parse_iso(node.next_available_at)
            if next_at > now:
                continue
            if usage_type == UsageType.PEE and node.fixture_type.value in {"urinal", "mixed"}:
                eligible.append(node.node_id)
            if usage_type == UsageType.POO and node.fixture_type.value in {"stall", "mixed"}:
                eligible.append(node.node_id)
        return eligible

    def schedule_tick(self) -> None:
        while self.state.queue.pending_pee > 0:
            nodes = self._eligible_nodes(UsageType.PEE)
            if not nodes:
                break
            self._dispatch_to_node(nodes[0], UsageType.PEE)

        while self.state.queue.pending_poo > 0:
            nodes = self._eligible_nodes(UsageType.POO)
            if not nodes:
                break
            self._dispatch_to_node(nodes[0], UsageType.POO)

    def _dispatch_to_node(self, node_id: str, usage_type: UsageType) -> None:
        assignment = self.state.create_assignment(node_id=node_id, usage_type=usage_type)
        self.event_bus.publish("ASSIGNMENT_CREATED", asdict(assignment))
        ok = self.transport.send_assignment(assignment)
        if ok:
            assignment = self.state.update_assignment_status(assignment.assignment_id, AssignmentStatus.SENT)
            self.event_bus.publish("ASSIGNMENT_SENT", asdict(assignment))
            self.persistence.write_assignment(asdict(assignment))
        else:
            assignment = self.state.update_assignment_status(assignment.assignment_id, AssignmentStatus.FAILED)
            self.event_bus.publish("ASSIGNMENT_FAILED", asdict(assignment))
            self.persistence.write_assignment(asdict(assignment))

    def ack_started(self, assignment_id: str) -> None:
        assignment = self.state.update_assignment_status(assignment_id, AssignmentStatus.STARTED)
        self.event_bus.publish("ASSIGNMENT_STARTED", asdict(assignment))
        self.persistence.write_assignment(asdict(assignment))

    def ack_done(self, assignment_id: str) -> None:
        assignment = self.state.update_assignment_status(assignment_id, AssignmentStatus.DONE)
        self.event_bus.publish("ASSIGNMENT_DONE", asdict(assignment))
        self.persistence.write_assignment(asdict(assignment))
        self.schedule_tick()

    def ack_failed(self, assignment_id: str, reason: str = "") -> None:
        assignment = self.state.increment_assignment_retry(assignment_id)
        if assignment.retries > self.max_retries:
            assignment = self.state.update_assignment_status(assignment_id, AssignmentStatus.FAILED)
            self.event_bus.publish(
                "ASSIGNMENT_FAILED",
                {
                    **asdict(assignment),
                    "reason": reason,
                },
            )
            self.persistence.write_assignment(asdict(assignment))
            incident = self.state.create_incident(
                scope="node",
                node_id=assignment.node_id,
                incident_type="assignment_failure",
                severity="med",
                notes=reason or "max retries exceeded",
            )
            self.event_bus.publish("INCIDENT_OPENED", asdict(incident))
            self.persistence.write_incident(asdict(incident))
            self.schedule_tick()
            return

        assignment = self.state.update_assignment_status(assignment_id, AssignmentStatus.QUEUED)
        self.event_bus.publish("ASSIGNMENT_RETRY_QUEUED", asdict(assignment))
        self._dispatch_to_node(assignment.node_id, assignment.usage_type)

    def watchdog(self, heartbeat_timeout_sec: int = 20, sent_timeout_sec: int = 30) -> None:
        stale_nodes = self.state.mark_offline_timeouts(heartbeat_timeout_sec=heartbeat_timeout_sec)
        for stale in stale_nodes:
            self.event_bus.publish("NODE_STATUS_CHANGED", {"node_id": stale.node_id, "status": stale.status.value})
            incident = self.state.create_incident(
                scope="node",
                node_id=stale.node_id,
                incident_type="heartbeat_timeout",
                severity="high",
                notes="heartbeat timeout",
            )
            self.event_bus.publish("INCIDENT_OPENED", asdict(incident))
            self.persistence.write_incident(asdict(incident))

        now = datetime.now(timezone.utc)
        for assignment in list(self.state.assignments.values()):
            if assignment.status != AssignmentStatus.SENT:
                continue
            updated = parse_iso(assignment.updated_at)
            if updated < now - timedelta(seconds=sent_timeout_sec):
                self.ack_failed(assignment.assignment_id, reason="ack timeout")

