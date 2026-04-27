# Scheduler & Simulation Flow

The scheduler is a backend-authoritative FIFO queue processor that assigns
queued restroom users to the six physical fixtures (nodes). It operates
in two active modes — **SIM** (real ESP32 nodes via BLE) and **DUMMY**
(entirely in-process simulation) — plus an idle **TEST** mode where it
does nothing.

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Frontend (React)                                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Sidebar  │  │ Digital Twin │  │ Queue Panel   │  │
│  │ Play/    │  │ (fixtures +  │  │ Add Pee/Poo   │  │
│  │ Pause    │  │  occupancy)  │  │ Clear Queue   │  │
│  └────┬─────┘  └──────▲───────┘  └───────┬───────┘  │
│       │               │ SSE               │          │
│       │               │ (scheduler_state, │          │
│  POST │               │  assignment_*,    │  POST    │
│  /sim_runtime         │  queue_updated)   │  /enqueue│
│       │               │                   │          │
└───────┼───────────────┼───────────────────┼──────────┘
        │               │                   │
        ▼               │                   ▼
┌──────────────────────────────────────────────────────┐
│  Backend (Flask + Scheduler thread)                  │
│                                                      │
│  Scheduler (10 Hz tick loop)                         │
│  ┌──────────────────────────────────────────────┐    │
│  │  Queue  →  Assign  →  Reserve  →  Commit     │    │
│  │  (FIFO)   (behavioral   (3s preview  (flip   │    │
│  │            model picks   animation)  in_use)  │    │
│  └──────────────────────────────────────────────┘    │
│       │                                              │
│       │  SIM mode only: BLE send on commit           │
│       ▼                                              │
│  ┌──────────────────────────────────────────────┐    │
│  │  BLE Manager  ──BLE──>  ESP32 Nodes (1–6)    │    │
│  │               <──BLE──  SIM COMPLETE          │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## Modes

| Mode | Queue source | Assignment | Occupancy timing | Node traffic |
|------|-------------|------------|-----------------|--------------|
| **SIM** | Backend scheduler (`/api/scheduler/enqueue`) | Scheduler assigns via behavioral model | ESP32 manages internally; reports `SIM COMPLETE` | Yes — `MODE SET SIM`, `SIM NEW`, `SIM CONTROL PLAY/PAUSE` |
| **DUMMY** | Backend scheduler (`/api/scheduler/enqueue`) | Scheduler assigns via behavioral model | Scheduler timer (`busy_until`) | None |
| **TEST** | N/A | N/A | N/A | Manual testbench commands only |

## Complete SIM Mode Flow

### 1. Mode Switch

When the user selects **Simulation** mode in the header:

1. Frontend POSTs `/api/scheduler/mode` with `{"mode": "SIM"}`
2. Scheduler clears any in-flight queue/fixtures from a prior session
3. Scheduler sends `{"command":"MODE","type":"SET","action":"SIM"}` via BLE
   to every connected node
4. Frontend POSTs `/api/scheduler/sim_runtime` with the current play/pause
   state so the scheduler runtime is in sync

### 2. Enqueue Users

When the user clicks **Add Pee** or **Add Poo**:

1. Frontend POSTs `/api/scheduler/enqueue` with `{"type": "pee"}` or `{"type": "poo"}`
2. Scheduler creates a `QueueItem` with:
   - Auto-incremented `id`
   - Pre-sampled `duration_s` (pee: 2–4s, poo: 10–15s)
   - `prefers_stall` flag (shy pee-er sampled from `shy_peer_pct`)
   - `enqueued_at_sim_s` (current simulation clock)
3. Scheduler emits `queue_updated` SSE event
4. If simulation is running, immediately attempts assignment via `_try_assign()`

### 3. Play / Pause

When the user presses **Play**:

1. Frontend POSTs `/api/scheduler/sim_runtime` with `{"runtime": "running"}`
2. Scheduler starts the 10 Hz tick loop processing (assign → commit → release → expire)
3. Scheduler advances the simulation clock (`sim_time_s`)
4. Scheduler sends `{"command":"SIM","id":"","type":"CONTROL","action":"PLAY"}`
   to all connected nodes via BLE

When the user presses **Pause**:

1. Frontend POSTs `{"runtime": "paused"}`
2. Scheduler freezes all wall-clock deadlines (preview reservations) into
   remaining-seconds fields
3. Scheduler sends `{"command":"SIM","id":"","type":"CONTROL","action":"PAUSE"}`
   to all connected nodes via BLE
4. Tick loop stops advancing sim clock and processing assignments

### 4. Assignment (Two-Pass Behavioral Model)

On each tick (and after each enqueue), the scheduler runs `_try_assign()`:

**Pass 1 — Urinals (non-shy pee users):**

- Iterates the queue for pee users who are *not* shy
- For each, computes etiquette-weighted shares across free urinals:
  - Edge urinals get ~49% each, middle gets `middle_toilet_first_choice_pct`
    (default 2%)
  - Shares adjust as urinals become occupied
- Picks a urinal via sequential cleanliness evaluation (the user evaluates
  fixtures in etiquette order and accepts/rejects based on cleanliness RNG)
- If the user rejects all urinals (bad cleanliness), they **wait** — the
  urinal pass stops for this tick
- On success: the fixture is **reserved** (3-second preview animation)

**Pass 2 — Stalls (poo users + shy pee users):**

- Iterates the remaining queue in FIFO order
- Same etiquette-weighted pick logic applied to stalls
- If a user rejects all stalls, they **exit** immediately (removed from queue,
  `exited_users` incremented)
- Pee users who still have free urinals available are skipped (they belong
  to the urinal pass)

### 5. Reservation → Commit → BLE Send

When `_try_assign()` picks a fixture for a user:

1. Fixture enters **reserved** state for `PREVIEW_DURATION_S` (3 seconds)
2. Scheduler emits `assignment_preview` SSE event
3. Digital twin shows an arrow animation from the queue to the target fixture

After the 3-second preview elapses (`_commit_reservations()`):

1. Reservation promotes to **in_use**
2. Queue item is removed from the queue
3. **SIM mode**: scheduler sends the BLE command to the assigned node:
   ```json
   {"command":"SIM","id":"<queue_item_id>","type":"NEW","action":{"duration_s": <float>}}
   ```
   `busy_until` is set to `null` — the ESP32 owns the occupancy timer.
4. **DUMMY mode**: `busy_until` = `now + duration_s` — the scheduler's tick
   loop manages the timer internally.
5. Scheduler emits `assignment_started` SSE event
6. Scheduler emits `queue_updated` SSE event

### 6. Occupancy & Completion

**SIM mode** — ESP32-driven:

- The ESP32 receives `SIM NEW`, moves the servo to MAX, waits `duration_s`,
  returns servo to REST, then sends back:
  ```json
  {"command":"SIM","id":"<user_id>","type":"COMPLETE","action":{"success": true}}
  ```
- The backend `_handle_sim_complete()` callback forwards this to
  `scheduler.notify_complete(node_id)`
- Scheduler releases the fixture, increments `satisfied_users` (or
  `exited_users` on failure), and emits `assignment_completed`
- Scheduler immediately calls `_try_assign()` to fill the newly free fixture

**DUMMY mode** — timer-driven:

- The scheduler's tick loop checks `busy_until <= now` in `_release_completed()`
- On expiry: fixture released, `satisfied_users` incremented,
  `assignment_completed` emitted, `_try_assign()` called

### 7. Queue Timeout

Users who wait longer than `QUEUE_WAIT_TIMEOUT_S` (10 seconds of
simulation time) without being assigned are automatically removed:

- `_expire_queue_timeouts()` runs on each tick
- Users currently in a preview reservation are exempt
- Removed users increment `exited_users`
- Scheduler emits `queue_item_exited` and `queue_updated` SSE events

## BLE Command Summary (SIM Mode)

| When | Command | Payload |
|------|---------|---------|
| Mode switch to SIM | `MODE SET` | `{"command":"MODE","type":"SET","action":"SIM"}` |
| Play pressed | `SIM CONTROL` | `{"command":"SIM","id":"","type":"CONTROL","action":"PLAY"}` |
| Pause pressed | `SIM CONTROL` | `{"command":"SIM","id":"","type":"CONTROL","action":"PAUSE"}` |
| User assigned to node N | `SIM NEW` | `{"command":"SIM","id":"<id>","type":"NEW","action":{"duration_s":<float>}}` |
| ESP32 finishes cycle | `SIM COMPLETE` (RX) | `{"command":"SIM","id":"<id>","type":"COMPLETE","action":{"success":<bool>}}` |

## Behavioral Model Configuration

All assignment weights are configurable from the Simulation Configuration
sidebar:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `shy_peer_pct` | 5% | Chance a pee user avoids urinals and uses a stall instead |
| `middle_toilet_first_choice_pct` | 2% | Weight of the middle fixture in a 3-fixture group (edge fixtures split the remaining ~98%) |
| Restroom Preset | `maclean_2m` | Determines which fixture slots are stalls, urinals, or nonexistent |
| Per-fixture Cleanliness | Clean → Dirty → Out-of-Order | Affects acceptance probability during sequential evaluation; Out-of-Order fixtures are never assigned |

## Node Connectivity

In SIM mode, the scheduler only assigns users to fixtures whose
corresponding BLE node is currently connected. The `BleManager` publishes
connection status changes; `server.py` subscribes and calls
`scheduler.set_node_connections()` to keep the scheduler's view in sync.

If a node disconnects while a fixture is in use (waiting for `SIM COMPLETE`),
the fixture remains in the `in_use` state. No new users will be assigned to
it. If the node reconnects and the ESP32 sends `COMPLETE`, the fixture is
released normally. Otherwise, the user can reset the simulation to clear
stuck fixtures.
