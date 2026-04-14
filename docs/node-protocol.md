# Node Protocol (v1)

The simulation controller and node layer communicate using versioned JSON payloads.

## Controller -> Node

- `SCHEDULE_ASSIGN`
  - `{ "schema_version":"v1", "assignment_id":"...", "usage_type":"pee|poo", "duration_sec":20 }`
- `SCHEDULE_CANCEL`
  - `{ "schema_version":"v1", "assignment_id":"..." }`
- `PING`
  - `{ "schema_version":"v1", "ts":"..." }`

## Node -> Controller

- `REGISTER`
  - `{ "schema_version":"v1", "node_id":"...", "fixture_type":"stall|urinal|mixed", "metadata":{...} }`
- `HEARTBEAT`
  - `{ "schema_version":"v1", "node_id":"...", "status":"online|busy|offline|out_of_order" }`
- `ASSIGNMENT_START`
  - `{ "schema_version":"v1", "node_id":"...", "assignment_id":"..." }`
- `ASSIGNMENT_DONE`
  - `{ "schema_version":"v1", "node_id":"...", "assignment_id":"..." }`
- `ASSIGNMENT_FAIL`
  - `{ "schema_version":"v1", "node_id":"...", "assignment_id":"...", "reason":"..." }`

## Transport Boundary

- Scheduler calls transport via `NodeTransport` interface:
  - `send_assignment(assignment) -> bool`
  - `cancel_assignment(assignment) -> bool`
  - `ping(node_id) -> bool`
- Transport implementation can be Wi-Fi HTTP, MQTT, or Bluetooth without changing scheduler logic.

