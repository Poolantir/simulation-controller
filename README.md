# Poolantir Simulation Controller

Flask-based scheduler service for simulation demand, node assignment orchestration, and operational event streaming.

## Features

- REST API for config, demand, incidents, node lifecycle, and state snapshots.
- Deterministic scheduling with fixed pee/poo durations and next-availability tracking.
- SSE stream for real-time UI synchronization.
- Node transport abstraction with mock transport default.
- InfluxDB persistence adapter (optional via env vars).
- Simulation usage ingestion endpoint for Influx-backed restroom telemetry.
- Watchdog for heartbeat and assignment timeout fault handling.

## Quickstart

```sh
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Server default: `http://localhost:5000`

## API docs

- OpenAPI starter: `openapi.yaml`
- Node protocol: `docs/node-protocol.md`

## Tests

```sh
pytest
```

## Environment

Copy `.env.example` to `.env`:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `5000`)
- `WATCHDOG_INTERVAL_SEC` (default `5`)
- `INFLUXDB_URL` (Influx Cloud or OSS URL)
- `INFLUXDB_TOKEN` (write token)
- `INFLUXDB_ORG` (organization name)
- `INFLUXDB_BUCKET` (target bucket)
- `STATE_SNAPSHOT_PATH` (runtime recovery snapshot JSON path)
- `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_SEC` (basic per-client throttle)
- `MAX_CONTENT_LENGTH_BYTES` (request body safety limit)
- `API_AUTH_TOKEN` (Bearer token for mutating UI/admin endpoints)
- `NODE_AUTH_TOKEN` (`X-Node-Token` for node register/heartbeat/ack endpoints)
- `ALLOWED_ORIGIN` (optional CORS allow-origin)

## Influx contract for simulation and mobile teams

Canonical restrooms:

- `seamans_f1_mens` -> Seamans Center 1st Floor Mens Restroom (2 stalls, 2 urinals)
- `maclean_f2_mens` -> MacLean Hall 2nd Floor Mens Restroom (3 stalls, 3 urinals)

Influx measurements in one bucket:

- `restroom_usage` (team-facing telemetry)
  - Tags: `restroom_id`, `toilet_type`, `source`
  - Fields: `node_id`, `duration_s`, `is_anomaly`, `scenario`, `event_version`, `payload_json`
- `simulation_events` (lineage/audit stream)
  - Tags: `event_type`, `restroom_id`, `source`
  - Fields: `payload_json` plus mirrored numeric/string fields

### Simulation ingest API

`POST /api/v1/simulation/usage`

Accepts either one event or `{ "events": [...] }`. Required event fields:

- `restroom` (alias: `seamen`/`seamans`/`maclean`) or canonical `restroom_id`
- `node_id` (int)
- `toilet_type` (`stall` or `urinal`)
- `duration_s` (float > 0)

Optional fields:

- `scenario` (string, default `baseline`)
- `is_anomaly` (bool)
- `source` (`simulation` or `dummy`, default `simulation`)

Example:

```json
{
  "source": "simulation",
  "events": [
    {
      "restroom": "seamen",
      "node_id": 2,
      "toilet_type": "stall",
      "duration_s": 123.4
    }
  ]
}
```

### Dummy anomaly generator API

`POST /api/v1/simulation/dummy/generate`

Body options:

- `count` (1..2000, default `25`)
- `restroom` (optional restroom alias or canonical id)
- `seed` (optional deterministic seed)

