from __future__ import annotations

from dataclasses import asdict

from .models import Assignment


class NodeTransport:
    def send_assignment(self, assignment: Assignment) -> bool:
        raise NotImplementedError

    def cancel_assignment(self, assignment: Assignment) -> bool:
        raise NotImplementedError

    def ping(self, node_id: str) -> bool:
        raise NotImplementedError


class MockNodeTransport(NodeTransport):
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.cancelled: list[str] = []
        self.pings: list[str] = []

    def send_assignment(self, assignment: Assignment) -> bool:
        self.sent.append(asdict(assignment))
        return True

    def cancel_assignment(self, assignment: Assignment) -> bool:
        self.cancelled.append(assignment.assignment_id)
        return True

    def ping(self, node_id: str) -> bool:
        self.pings.append(node_id)
        return True

