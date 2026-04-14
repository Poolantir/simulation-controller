from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


class UsageType(str, Enum):
    PEE = "pee"
    POO = "poo"


class NodeStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    OUT_OF_ORDER = "out_of_order"


class AssignmentStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    STARTED = "started"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


class IncidentStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class IncidentSeverity(str, Enum):
    LOW = "low"
    MED = "med"
    HIGH = "high"


class IncidentType(str, Enum):
    OUT_OF_ORDER = "out_of_order"
    STUCK_OCCUPIED = "stuck_occupied"
    SENSOR_FAULT = "sensor_fault"
    MANUAL_BLOCK = "manual_block"
    HEARTBEAT_TIMEOUT = "heartbeat_timeout"
    ASSIGNMENT_FAILURE = "assignment_failure"


class FixtureType(str, Enum):
    STALL = "stall"
    URINAL = "urinal"
    MIXED = "mixed"


@dataclass
class BathroomConfig:
    bathroom_id: str = "default"
    stalls: int = 3
    urinals: int = 3
    pee_duration_sec: int = 20
    poo_duration_sec: int = 300
    updated_at: str = field(default_factory=iso_now)
    schema_version: str = "v1"

    def validate(self) -> None:
        if self.stalls < 0 or self.urinals < 0:
            raise ValueError("stalls and urinals must be >= 0")
        if self.pee_duration_sec <= 0 or self.poo_duration_sec <= 0:
            raise ValueError("durations must be > 0")


@dataclass
class DemandQueue:
    pending_pee: int = 0
    pending_poo: int = 0
    updated_at: str = field(default_factory=iso_now)
    schema_version: str = "v1"

    def apply_delta(self, pee_delta: int, poo_delta: int) -> None:
        next_pee = self.pending_pee + pee_delta
        next_poo = self.pending_poo + poo_delta
        if next_pee < 0 or next_poo < 0:
            raise ValueError("queue delta cannot make values negative")
        self.pending_pee = next_pee
        self.pending_poo = next_poo
        self.updated_at = iso_now()


@dataclass
class Node:
    node_id: str
    fixture_type: FixtureType
    status: NodeStatus = NodeStatus.ONLINE
    next_available_at: str = field(default_factory=iso_now)
    active_assignment_id: str | None = None
    last_heartbeat_at: str = field(default_factory=iso_now)
    metadata: dict[str, Any] = field(default_factory=dict)
    schema_version: str = "v1"


@dataclass
class Assignment:
    assignment_id: str
    node_id: str
    usage_type: UsageType
    scheduled_start_at: str
    scheduled_end_at: str
    status: AssignmentStatus = AssignmentStatus.QUEUED
    source: str = "sim"
    retries: int = 0
    created_at: str = field(default_factory=iso_now)
    updated_at: str = field(default_factory=iso_now)
    schema_version: str = "v1"


@dataclass
class Incident:
    incident_id: str
    scope: str
    node_id: str | None
    incident_type: IncidentType
    severity: IncidentSeverity
    status: IncidentStatus = IncidentStatus.OPEN
    notes: str = ""
    created_at: str = field(default_factory=iso_now)
    resolved_at: str | None = None
    schema_version: str = "v1"


@dataclass
class EventEnvelope:
    event_type: str
    payload: dict[str, Any]
    sequence: int
    timestamp: str = field(default_factory=iso_now)
    schema_version: str = "v1"


def new_assignment_id() -> str:
    return str(uuid4())


def new_incident_id() -> str:
    return str(uuid4())


def model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "__dataclass_fields__"):
        return asdict(model)
    return dict(model)

