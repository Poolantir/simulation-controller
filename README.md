# Poolantir Simulation Controller

Flask-based scheduler service for simulation demand, node assignment orchestration, and operational event streaming.

## Features

- REST API for config, demand, incidents, node lifecycle, and state snapshots.
- Deterministic scheduling with fixed pee/poo durations and next-availability tracking.
- SSE stream for real-time UI synchronization.
- Node transport abstraction with mock transport default.
- Firestore persistence adapter (optional via `FIREBASE_CREDENTIAL_PATH`).
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
- `FIREBASE_CREDENTIAL_PATH` (optional path to Firebase JSON credential)
- `STATE_SNAPSHOT_PATH` (runtime recovery snapshot JSON path)
- `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_SEC` (basic per-client throttle)
- `MAX_CONTENT_LENGTH_BYTES` (request body safety limit)
- `API_AUTH_TOKEN` (Bearer token for mutating UI/admin endpoints)
- `NODE_AUTH_TOKEN` (`X-Node-Token` for node register/heartbeat/ack endpoints)
- `ALLOWED_ORIGIN` (optional CORS allow-origin)

