# Influx Integration Contract

This document is the copy-paste integration spec for simulation and mobile clients.

## Canonical restrooms

- `seamans_f1_mens` — Seamans Center 1st Floor Mens Restroom
- `maclean_f2_mens` — MacLean Hall 2nd Floor Mens Restroom

## Environment configuration

- `INFLUXDB_URL`
- `INFLUXDB_TOKEN`
- `INFLUXDB_ORG`
- `INFLUXDB_BUCKET`

## Measurements

### 1) `restroom_usage` (primary integration surface)

Tags:

- `restroom_id`
- `toilet_type`
- `source` (`simulation` or `dummy`)

Fields:

- `node_id` (int)
- `duration_s` (float)
- `is_anomaly` (bool)
- `scenario` (str)
- `event_version` (str, currently `v1`)
- `payload_json` (full event JSON string)

### 2) `simulation_events` (audit/lineage)

Tags:

- `event_type`
- `restroom_id`
- `source`

Fields:

- `payload_json`
- mirrored scalar values from payload

## Required producer payload format (simulation team)

Endpoint: `POST /api/v1/simulation/usage`

Single event form:

```json
{
  "restroom": "seamen",
  "node_id": 1,
  "toilet_type": "stall",
  "duration_s": 128.2
}
```

Batch form:

```json
{
  "source": "simulation",
  "events": [
    {
      "restroom": "maclean",
      "node_id": 6,
      "toilet_type": "urinal",
      "duration_s": 23.4,
      "scenario": "baseline",
      "is_anomaly": false
    }
  ]
}
```

Validation rules:

- `restroom` supports aliases (`seamen`, `seamans`, `maclean`) and canonical ids.
- `node_id` must be integer.
- `toilet_type` must be `stall` or `urinal`.
- `duration_s` must be positive.

## Dummy data stream (ML/testing)

Endpoint: `POST /api/v1/simulation/dummy/generate`

Example:

```json
{
  "count": 100,
  "seed": 7,
  "restroom": "maclean"
}
```

Dummy records are marked with:

- `source = "dummy"`
- `is_anomaly = true|false` depending on scenario
- `scenario` values like `anomaly_burst`, `sensor_glitch_short`, `baseline`

## Mobile team query patterns

Latest per node (example Flux skeleton):

```flux
from(bucket: "<bucket>")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "restroom_usage")
  |> filter(fn: (r) => r._field == "payload_json")
  |> filter(fn: (r) => r.restroom_id == "seamans_f1_mens")
  |> sort(columns: ["_time"], desc: true)
```

Stall vs urinal breakdown:

- Filter tag `toilet_type == "stall"` or `toilet_type == "urinal"`.

Anomaly-only stream:

- Filter tag `source == "dummy"` and field `is_anomaly == true`.

## Error contract

On invalid payloads, API returns:

```json
{
  "error": {
    "code": "invalid_payload",
    "message": "<reason>"
  }
}
```
