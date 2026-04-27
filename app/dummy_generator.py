from __future__ import annotations

import random
from typing import Any

from .influx_contract import CANONICAL_RESTROOMS


def generate_dummy_usage_events(
    count: int,
    restroom_id: str | None = None,
    seed: int | None = None,
) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    restrooms = [restroom_id] if restroom_id else list(CANONICAL_RESTROOMS.keys())
    events: list[dict[str, Any]] = []
    for _ in range(count):
        selected_restroom = rng.choice(restrooms)
        roll = rng.random()
        if roll < 0.2:
            toilet_type = "stall"
            duration_s = round(rng.uniform(600.0, 1400.0), 2)
            scenario = "anomaly_burst"
            is_anomaly = True
        elif roll < 0.35:
            toilet_type = "urinal"
            duration_s = round(rng.uniform(0.8, 2.5), 2)
            scenario = "sensor_glitch_short"
            is_anomaly = True
        else:
            toilet_type = "stall" if rng.random() < 0.45 else "urinal"
            duration_s = round(rng.uniform(20.0, 420.0), 2)
            scenario = "baseline"
            is_anomaly = False
        events.append(
            {
                "restroom_id": selected_restroom,
                "node_id": int(rng.randint(1, 12)),
                "toilet_type": toilet_type,
                "duration_s": duration_s,
                "scenario": scenario,
                "is_anomaly": is_anomaly,
            }
        )
    return events
