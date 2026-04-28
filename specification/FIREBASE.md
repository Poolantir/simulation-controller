# Poolantir — Sensor Integration Reference
 
## Firebase Project
 
**Project ID:** `project-8cedad87-2f1c-4584-80b`  
**Database ID:** `ai-studio-1d62c42d-fa2b-43bb-9651-132292ad29f8`  
**API Key:** `AIzaSyC2Z9MpqmisbK6kSa51NfHDIM9jva67xi4`
 
---

# When to overwirte the stalls

The simulation controller should simply overwrite the toilet ids according to the simulation operations:
1. (SIMULATION MODE ONLY) when the user is sent to the toilet (and its duration starts decrementing) -> "in_use"
2. (SIMULATION MODE ONLY) when the user completes its usage cycle (and its duration expires) -> "vacant"
3. when the operator switches to simulation mode -> "online"
4. when the operator switches to testing mode -> "offline"
 
## EXAPMLE PSUEDO-Sending an event
 
```python
import requests
from datetime import datetime, timezone
 
API_KEY    = "AIzaSyC2Z9MpqmisbK6kSa51NfHDIM9jva67xi4"
PROJECT_ID = "project-8cedad87-2f1c-4584-80b"
DATABASE   = "ai-studio-1d62c42d-fa2b-43bb-9651-132292ad29f8"
 
URL = (
    f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
    f"/databases/{DATABASE}/documents/sensor_events"
    f"?key={API_KEY}"
)
 
def send_event(node_id: str, event: str):
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "fields": {
            "nodeId":    { "stringValue": node_id },
            "event":     { "stringValue": event },
            "timestamp": { "timestampValue": timestamp },
        }
    }
    r = requests.post(URL, json=payload)
    r.raise_for_status()
    print(f"  ✓  {node_id}  {event}")
 
# Example — replace with your real data:
send_event("TUR-1", "in_use")
send_event("TUR-1", "vacant")
send_event("TST-1", "offline")
send_event("TST-1", "online")
```
 
---
 
## Node IDs
 
| Node ID | Type   |
|---------|--------|
| `TUR-1` | Urinal |
| `TUR-2` | Urinal |
| `TUR-3` | Urinal |
| `TST-1` | Stall  |
| `TST-2` | Stall  |
| `TST-3` | Stall  |
 
---
 
## Event Types
 
| `event` value | What it does |
|---------------|--------------|
| `"in_use"`  | Marks node "in_use"
| `"vacant"`  | Marks node online |
| `"offline"` | Marks node offline |
| `"online"`  | Clears offline state, marks node online |