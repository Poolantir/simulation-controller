# Simulation Controller Runbook

## Start services

1. Copy `.env.example` to `.env`.
2. Launch:
   - Local: `python -m app.main`
   - Container: `docker compose up --build`

## Seed demo data

```sh
python scripts/seed_demo.py
```

## Validate API

- `GET /health/live`
- `GET /api/v1/state`
- `POST /api/v1/nodes/register`
- `POST /api/v1/demand/delta`

## Troubleshooting

### Queue not draining
- Confirm nodes are registered and status is `online`.
- Check incidents for `out_of_order` state.
- Check assignment status for repeated `failed`.

### Node appears stale
- Ensure heartbeat endpoint is being called.
- Watchdog marks nodes offline after timeout.
- Resolve incident and heartbeat node to return it to service.

### InfluxDB data not appearing
- Verify `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, and `INFLUXDB_BUCKET`.
- Ensure the token has write access to the bucket.
- If these vars are unset, backend runs with no-op persistence.

### Stream not updating frontend
- Ensure frontend is connected to `/api/v1/stream`.
- Check browser console for EventSource errors.

