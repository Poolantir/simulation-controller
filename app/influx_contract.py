from __future__ import annotations

from dataclasses import dataclass
from typing import Any

EVENT_VERSION = "v1"

RESTROOM_ALIASES = {
    "seamen": "seamans_f1_mens",
    "seamans": "seamans_f1_mens",
    "seamans_center": "seamans_f1_mens",
    "maclean": "maclean_f2_mens",
    "maclean_hall": "maclean_f2_mens",
}

CANONICAL_RESTROOMS = {
    "seamans_f1_mens": {
        "display_name": "Seamans Center 1st Floor Mens Restroom",
        "stalls": 2,
        "urinals": 2,
    },
    "maclean_f2_mens": {
        "display_name": "MacLean Hall 2nd Floor Mens Restroom",
        "stalls": 3,
        "urinals": 3,
    },
}

VALID_TOILET_TYPES = {"stall", "urinal"}
VALID_SOURCES = {"simulation", "dummy"}


@dataclass(frozen=True)
class RestroomUsageRecord:
    restroom_id: str
    node_id: int
    toilet_type: str
    duration_s: float
    source: str
    is_anomaly: bool
    scenario: str
    event_version: str = EVENT_VERSION

    def as_payload(self) -> dict[str, Any]:
        return {
            "restroom_id": self.restroom_id,
            "node_id": self.node_id,
            "toilet_type": self.toilet_type,
            "duration_s": self.duration_s,
            "source": self.source,
            "is_anomaly": self.is_anomaly,
            "scenario": self.scenario,
            "event_version": self.event_version,
        }


def canonicalize_restroom_id(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        raise ValueError("restroom is required")
    if normalized in CANONICAL_RESTROOMS:
        return normalized
    if normalized in RESTROOM_ALIASES:
        return RESTROOM_ALIASES[normalized]
    raise ValueError("restroom must be one of: seamen, seamans, maclean")


def normalize_usage_payload(payload: dict[str, Any], source: str = "simulation") -> RestroomUsageRecord:
    restroom_raw = payload.get("restroom") or payload.get("restroom_id")
    restroom_id = canonicalize_restroom_id(restroom_raw)
    if source not in VALID_SOURCES:
        raise ValueError("source must be simulation or dummy")

    try:
        node_id = int(payload["node_id"])
    except Exception as exc:
        raise ValueError("node_id must be an integer") from exc

    toilet_type = str(payload.get("toilet_type", "")).strip().lower()
    if toilet_type not in VALID_TOILET_TYPES:
        raise ValueError("toilet_type must be stall or urinal")

    try:
        duration_s = float(payload["duration_s"])
    except Exception as exc:
        raise ValueError("duration_s must be numeric") from exc
    if duration_s <= 0:
        raise ValueError("duration_s must be > 0")

    is_anomaly = bool(payload.get("is_anomaly", source == "dummy"))
    scenario = str(payload.get("scenario", "baseline")).strip() or "baseline"

    return RestroomUsageRecord(
        restroom_id=restroom_id,
        node_id=node_id,
        toilet_type=toilet_type,
        duration_s=duration_s,
        source=source,
        is_anomaly=is_anomaly,
        scenario=scenario,
    )
