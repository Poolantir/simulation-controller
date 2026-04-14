# Raspberry Pi Deployment Notes

## Container deployment

1. Install Docker and Docker Compose plugin on Raspberry Pi.
2. Copy repository to Pi.
3. Set `.env` values:
   - `HOST=0.0.0.0`
   - `PORT=5000`
   - `WATCHDOG_INTERVAL_SEC=5`
   - `FIREBASE_CREDENTIAL_PATH=/run/secrets/firebase.json` (optional)
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
- Firestore stores historical assignments/incidents/events.
- If controller restarts, re-seed nodes and demand as needed.

