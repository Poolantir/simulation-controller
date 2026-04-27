from __future__ import annotations

import argparse
import csv
import gzip
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


RESTROOMS = {
    "seamans_f1_mens": {"stalls": 2, "urinals": 2},
    "maclean_f2_mens": {"stalls": 3, "urinals": 3},
}

FIELDNAMES = [
    "event_ts",
    "restroom_id",
    "toilet_type",
    "node_id",
    "duration_s",
    "is_anomaly",
    "scenario",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "foot_traffic_idx",
    "queue_depth",
    "cleaning_window",
    "maintenance_flag",
    "sensor_confidence",
    "expected_wait_s",
    "best_time_next_15m",
    "best_time_next_30m",
]


def _base_duration(rng: random.Random, toilet_type: str) -> float:
    if toilet_type == "urinal":
        return rng.uniform(15.0, 70.0)
    return rng.uniform(70.0, 520.0)


def _traffic_index(hour: int, day_of_week: int, rng: random.Random) -> float:
    weekday_boost = 0.25 if day_of_week < 5 else -0.15
    peak_boost = 0.35 if hour in {9, 10, 11, 12, 13, 14} else 0.0
    late_penalty = -0.25 if hour < 7 or hour > 20 else 0.0
    val = 0.45 + weekday_boost + peak_boost + late_penalty + rng.uniform(-0.15, 0.15)
    return max(0.0, min(1.0, val))


def generate_records(n_rows: int, seed: int) -> list[dict[str, object]]:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=365)
    rows: list[dict[str, object]] = []

    restroom_keys = list(RESTROOMS.keys())
    for _ in range(n_rows):
        restroom_id = restroom_keys[rng.randint(0, len(restroom_keys) - 1)]
        meta = RESTROOMS[restroom_id]

        ts = start + timedelta(seconds=rng.randint(0, int((now - start).total_seconds())))
        hour = ts.hour
        dow = ts.weekday()
        is_weekend = dow >= 5

        toilet_type = "stall" if rng.random() < 0.55 else "urinal"
        max_nodes = meta["stalls"] if toilet_type == "stall" else meta["urinals"]
        node_id = rng.randint(1, max_nodes)

        traffic = _traffic_index(hour, dow, rng)
        queue_depth = int(round(traffic * rng.uniform(0, 14)))
        cleaning_window = 1 if hour in {2, 3, 4} and rng.random() < 0.35 else 0
        maintenance_flag = 1 if rng.random() < 0.015 else 0
        sensor_confidence = max(0.55, min(1.0, rng.uniform(0.76, 0.995) - maintenance_flag * 0.2))

        duration_s = _base_duration(rng, toilet_type)
        duration_s *= 1.0 + (traffic - 0.5) * 0.30
        duration_s *= 1.0 + queue_depth * 0.015
        duration_s *= 1.25 if cleaning_window else 1.0

        is_anomaly = 0
        scenario = "baseline"
        if rng.random() < 0.03:
            is_anomaly = 1
            if rng.random() < 0.5:
                scenario = "anomaly_burst"
                duration_s *= rng.uniform(1.6, 2.8)
            else:
                scenario = "sensor_glitch_short"
                duration_s = rng.uniform(1.0, 8.0)

        expected_wait_s = max(0.0, queue_depth * (16.0 if toilet_type == "urinal" else 42.0) * (0.7 + traffic))
        best_time_next_15m = 1 if (traffic < 0.45 and queue_depth <= 2 and not cleaning_window) else 0
        best_time_next_30m = 1 if (traffic < 0.55 and queue_depth <= 3 and not cleaning_window) else 0

        rows.append(
            {
                "event_ts": ts.isoformat(),
                "restroom_id": restroom_id,
                "toilet_type": toilet_type,
                "node_id": node_id,
                "duration_s": round(max(1.0, duration_s), 3),
                "is_anomaly": is_anomaly,
                "scenario": scenario,
                "hour_of_day": hour,
                "day_of_week": dow,
                "is_weekend": 1 if is_weekend else 0,
                "foot_traffic_idx": round(traffic, 4),
                "queue_depth": queue_depth,
                "cleaning_window": cleaning_window,
                "maintenance_flag": maintenance_flag,
                "sensor_confidence": round(sensor_confidence, 4),
                "expected_wait_s": round(expected_wait_s, 3),
                "best_time_next_15m": best_time_next_15m,
                "best_time_next_30m": best_time_next_30m,
            }
        )
    return rows


def write_csv_gz(rows: list[dict[str, object]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output_path, "wt", newline="", encoding="utf-8") as gz_file:
        writer = csv.DictWriter(gz_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic restroom ML dataset.")
    parser.add_argument("--rows", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output",
        type=str,
        default="data/ml_training/restroom_usage_1m.csv.gz",
    )
    args = parser.parse_args()

    rows = generate_records(n_rows=args.rows, seed=args.seed)
    output_path = Path(args.output)
    write_csv_gz(rows=rows, output_path=output_path)
    print(f"WROTE_ROWS={len(rows)}")
    print(f"OUTPUT_FILE={output_path.resolve()}")


if __name__ == "__main__":
    main()
