# Poolantir Simulation Interface

TODO - ADD A PICTURE OF COMPLETED FRONTEND

Interactive controller for the Poolantir 3D modeled diorama. This is intended to be a sort of human-in-the-loop simulation, requiring a human to configure the state of the bathroom, dispact "users" to the bathroom.
The state of each toilet is dynamically set (clean, fair, dirty, out of order), and scheduled users are placed into 1 of 6 toilets depending on the type of usage and state of the toilet. 

*Cleanliness classifications (priority):*

- P(5) clean (100%)
- P(4) fair (75%)
- P(3) dirty (50%)
- P(2) horrendous (10%)
- P(1) out-of-order (0%)
- P(0) currently being cleaned (0%)
- P(-1) non-existent (0%) (used for simulating bathrooms with fewer toilets)
These values are configurable within the application interface

In addition to setting the state of the toilet, the user can "clean" the restroom to repair it to the "clean" state. This all happens in real-time

This application allows a user to configure the state of the restroom by setting:

## Poolantir Architecture

  
*Poolantir Architecture (left)    |    Simulation Flow (right)*

### React Frontend

Using React to create a single page front-end to control the 3D diorama.

  
*Figma Sketch*

### Python Backend

Using a simple flask server for the priority queue toilet scheduler and connection to Firebase

#### Scheduling Algorithm

  
*Poolantir Scheduler (left)    |    High-Level Flow (right)*

*Idea:*
Similar to how real restrooms work, users will enter the restroom, assess the toilet state (open/used/almost open/out of order) and choose the first open toilet which satisfies their use type (1: pee, 2: poo :) ).
In real life, this is a FIFO queue (assumming human decency), where the next in line may choose the toilet of their need before following users in the queue. To account for a user resorting to a toilet of less cleanliness, I have factored in some percent chances for a user to select an open toilet given its classification. 

*Rules:*

1. Pee ("1s") - can use either the urinals or stalls
2. Shy pee-ers - this is a small percentage of the population who have peeing anxiety (assuming 2%). These users will elect to use the stalls as their first choice.
3. Respect assummed percentages - clean (100%), fair (75%), dirty (50%), In-Use (0%), out-of-order (0%). These percentages factor into the behavioral model for the FIFO scheduler.

*Total Cases:*

- urinals: 2^3 = 8 (not in use, pee)
- stalls: 3^3 = 27 (not in use, pee, poo)
*Total = urinals * stalls = 216*

MORE DETAILED ASSUMPTIONS CAN BE FOUND WITHIN [scheduler.md](./specification/scheduler.md)

## Running the Project

Docker is no longer used. The backend talks to 6 BLE nodes via `bleak`, which  
requires direct access to the host Bluetooth radio — on macOS, Do:w

cker  
Desktop cannot expose that, so everything runs on the host.

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- A Bluetooth-capable machine (macOS/Linux) with the 6 Poolantir nodes powered on

### First-time setup

```bash
# backend virtualenv
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# frontend deps
(cd frontend && npm install)
```

### Start Application
Because Docker does not allow BLE, run the app from two terminals: one for the frontend and one for the backend.

```
# Front-end
cd ./frontend

npm run dev
```

```
# Backend
# from repo root
backend/.venv/bin/python backend/server.py
```

### Services


| Service   | URL                                            |
| --------- | ---------------------------------------------- |
| React UI  | [http://localhost:5173](http://localhost:5173) |
| Flask API | [http://localhost:5001](http://localhost:5001) |


## Dummy Mode

Dummy Mode drives the digital twin as a pure simulation — no BLE nodes
are required. Users are added to the queue via the `Pee`/`Poo` buttons;
the backend scheduler consumes them FIFO and places each user at an
eligible, currently-free toilet chosen by the behavioral model. The
occupancy of each fixture is released automatically after a randomised
usage duration, which re-opens that toilet to the next queued user.

### Behaviour

- **Usage durations**
  - Pee-ers: random uniform 2.0–4.0 seconds
  - Poo-ers: random uniform 10.0–15.0 seconds
- **Selection policy** (recomputed on *every* assignment)
  - Poo-ers only use stalls. If all stalls are busy, the user waits.
  - Pee-ers split stall-vs-urinal by `shyPeerPct`. When only one group
    has a free slot, 100% of the probability is redirected there.
  - The middle-toilet-first rule keeps working when siblings are busy:
    * Free middle + free outer(s): outers share `(1 - m)`, middle gets
      `m`. So a busy stall-3 plus a 2% middle rule puts 98% on stall-1.
    * Free middle only: middle gets 1.
    * Free outers only: 50/50 across remaining outers (e.g. middle busy
      with both outers free).
- **Preset support**
  - MacLean (3 stalls + 3 urinals): full 3-slot rules.
  - Seamen Center (2 stalls + 2 urinals, no middle): the middle rule
    does not apply; free slots split equally within each group.
- **Non-existent / Out-of-Order fixtures** are excluded from candidacy.
- **Reset Simulation** clears the backend queue, in-use flags, and
  satisfied-user count alongside the frontend's local sim state.

### Scheduler HTTP API

All scheduler endpoints are served by the Flask API (default
`http://localhost:5001`).

| Method | Path                            | Purpose                                    |
| ------ | ------------------------------- | ------------------------------------------ |
| GET    | `/api/scheduler/state`          | Current snapshot (mode, queue, fixtures).  |
| POST   | `/api/scheduler/mode`           | `{ "mode": "SIM" | "TEST" | "DUMMY" }`     |
| POST   | `/api/scheduler/config`         | Push preset / percentages / cleanliness.   |
| POST   | `/api/scheduler/enqueue`        | `{ "type": "pee" | "poo" }`                |
| POST   | `/api/scheduler/queue/clear`    | Drop every queued user.                    |
| POST   | `/api/scheduler/reset`          | Clear queue + in-use flags + counters.     |
| GET    | `/api/scheduler/stream`         | SSE stream of scheduler events.            |

SSE event types emitted on `/api/scheduler/stream`:

- `scheduler_state` (full snapshot; sent on connect and after major changes)
- `queue_updated`
- `assignment_started`
- `assignment_completed`
- `mode_changed`
- `config_updated`
- `reset`

### Tests

```
python3 -m unittest discover -s backend/tests -v
```
