# InfluxDB

The simulation controller writes to InfluxDB v2 (Cloud) on each **user-cycle completion** — both SIM and DUMMY modes.

## When to Upload

A point is written to the `user_cycle` measurement every time a fixture finishes its occupancy cycle:

- **DUMMY mode**: automatically when `busy_until` expires (`_release_completed`).
- **SIM mode**: when the ESP32 sends a `SIM COMPLETE` BLE notification (`notify_complete`).

Writes are **non-blocking** (enqueued to a background thread) and **best-effort** (retried 3× with exponential backoff; dropped on persistent failure).

## Measurement: `user_cycle`

### Tags (indexed, filterable)

| Tag            | Type   | Values                                       |
|----------------|--------|----------------------------------------------|
| `restroom`     | string | `"maclean_f2_mens"` \| `"seamans_f1_mens"`   |
| `toilet_type`  | string | `"stall"` \| `"urinal"`                      |
| `run_id`       | string | UUID generated at server startup              |
| `user_id`      | string | queue item id (stringified)                   |
| `mode`         | string | `"SIM"` \| `"DUMMY"`                         |

### Fields (values)

| Field        | Type  | Description                          |
|--------------|-------|--------------------------------------|
| `node_id`    | int   | Fixture id, `1..6`                   |
| `duration_s` | float | Occupancy duration in seconds        |

### Timestamp

Server wall-clock `time.time_ns()` at completion emission (nanosecond precision).

## Restroom Mapping

The scheduler config `restroom_preset` is mapped to Influx tag values via `restroom_from_preset()`:

| Preset ID    | Influx `restroom` tag |
|--------------|-----------------------|
| `maclean_2m` | `maclean_f2_mens`     |
| `seamen_1m`  | `seamans_f1_mens`     |

Unknown presets pass through as-is.

## Data Format (per point)

```json
{
  "restroom": "seamans_f1_mens",
  "node_id": 1,
  "toilet_type": "stall",
  "duration_s": 128.2
}
```

Plus `run_id`, `user_id`, and `mode` tags.

## Querying

```sql
SELECT * FROM "user_cycle"
```

> **Note**: existing test data lives in `simulation_events` — that is a separate measurement not used by the application.

## Environment Variables

Set in `.env` (repo root):

| Variable        | Description                              |
|-----------------|------------------------------------------|
| `INFLUX_URL`    | InfluxDB Cloud endpoint (no trailing `/`)|
| `INFLUX_TOKEN`  | API token with write access              |
| `INFLUX_ORG`    | Organization ID                          |
| `INFLUX_BUCKET` | Target bucket (default: `Simulation`)    |

## Implementation Files

| File                     | Role                                          |
|--------------------------|-----------------------------------------------|
| `backend/influx_layer.py`| `InfluxWriter` class + `UserCycleRecord`      |
| `backend/scheduler.py`   | Emits enriched `assignment_completed` events   |
| `backend/server.py`      | Wires global subscriber + `run_id` generation  |
