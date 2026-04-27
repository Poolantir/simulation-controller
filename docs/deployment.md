# Raspberry Pi Deployment Notes

## Container deployment

1. Install Docker and Docker Compose plugin on Raspberry Pi.
2. Copy repository to Pi.
3. Set `.env` values:
   - `HOST=0.0.0.0`
   - `PORT=5000`
   - `WATCHDOG_INTERVAL_SEC=5`
   - `INFLUXDB_URL=...`
   - `INFLUXDB_TOKEN=...`
   - `INFLUXDB_ORG=...`
   - `INFLUXDB_BUCKET=...`
4. Start service:
   - `docker compose up -d --build`

## Restart policy

`compose.yml` uses `restart: unless-stopped`.

## Observability

- Health checks:
  - `GET /health/live`
  - `GET /health/ready`
- Runtime stream:
  - `GET /api/v1/stream`
- Persist logs with Docker logging driver or sidecar.

## Backup and recovery

- Runtime queue is in-memory by default.
- InfluxDB stores historical assignments/incidents/events plus simulation telemetry.
- If controller restarts, re-seed nodes and demand as needed.

## Influx measurements provisioned by controller

Single bucket, two measurements:

- `restroom_usage`
- `simulation_events`

Minimum token scope for controller:

- Write access to the configured bucket
- Read access optional (not required for controller ingestion)

Rotation procedure:

1. Create new bucket-scoped token in Influx.
2. Update `INFLUXDB_TOKEN` in deployment secret/env.
3. Restart controller deployment.
4. Revoke old token after successful write verification.

