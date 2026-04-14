# API Reference (v1)

Base URL: `http://localhost:5000`

## Config

- `GET /api/v1/config`
- `PUT /api/v1/config`

Payload example:
```json
{
  "stalls": 3,
  "urinals": 3,
  "pee_duration_sec": 20,
  "poo_duration_sec": 300
}
```

## Demand

- `POST /api/v1/demand/delta`

Payload example:
```json
{
  "pee_delta": 10,
  "poo_delta": 2
}
```

Header:
- `Idempotency-Key: <uuid>`

## Incidents

- `GET /api/v1/incidents?status=open`
- `POST /api/v1/incidents`
- `PATCH /api/v1/incidents/{incident_id}`

## Nodes

- `POST /api/v1/nodes/register`
- `POST /api/v1/nodes/{node_id}/heartbeat`
- `POST /api/v1/nodes/{node_id}/ack-start`
- `POST /api/v1/nodes/{node_id}/ack-done`
- `POST /api/v1/nodes/{node_id}/ack-fail`

## State and stream

- `GET /api/v1/state`
- `GET /api/v1/stream` (SSE)

