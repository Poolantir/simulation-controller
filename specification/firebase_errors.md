# Error when overwriting stalls
I would like to connect the firebase db to the simulation scheduler to overwrite when stalls are in use, vacant (online), and on/offline

The logic is correct, however there are issues with my writing to the firestore database

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

# Error Message
```bash
2026-04-28 16:54:21,443 INFO firebase: sensor_event: TUR-2 offline
2026-04-28 16:54:21,727 ERROR firebase: stall status update failed: TUR-2 -> offline
Traceback (most recent call last):
  File "/Users/matthewkrueger/uiowa/sr/2/Poolantir/simulation-controller/backend/firebase_layer.py", line 152, in _update_stall_status
    r.raise_for_status()
  File "/opt/miniconda3/lib/python3.12/site-packages/requests/models.py", line 1024, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://firestore.googleapis.com/v1/projects/project-8cedad87-2f1c-4584-80b/databases/ai-studio-1d62c42d-fa2b-43bb-9651-132292ad29f8/documents/stalls/dmlNSysrGAzOt925HCni?updateMask.fieldPaths=status&key=AIzaSyC2Z9MpqmisbK6kSa51NfHDIM9jva67xi4
2026-04-28 16:54:21,961 INFO firebase: sensor_event: TUR-3 offline
2026-04-28 16:54:22,342 ERROR firebase: stall status update failed: TUR-3 -> offline
Traceback (most recent call last):
  File "/Users/matthewkrueger/uiowa/sr/2/Poolantir/simulation-controller/backend/firebase_layer.py", line 152, in _update_stall_status
    r.raise_for_status()
  File "/opt/miniconda3/lib/python3.12/site-packages/requests/models.py", line 1024, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 403 Client Error: Forbidden for url: https://firestore.googleapis.com/v1/projects/project-8cedad87-2f1c-4584-80b/databases/ai-studio-1d62c42d-fa2b-43bb-9651-132292ad29f8/documents/stalls/mUCJypOToNSEt5fXOIhs?updateMask.fieldPaths=status&key=AIzaSyC2Z9MpqmisbK6kSa51NfHDIM9jva67xi4
```

# Accessing the URL
```json
{
  "error": {
    "code": 400,
    "message": "Invalid JSON payload received. Unknown name \"updateMask.fieldPaths\": Cannot bind query parameter. Field 'updateMask' could not be found in request message.",
    "status": "INVALID_ARGUMENT",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        "fieldViolations": [
          {
            "description": "Invalid JSON payload received. Unknown name \"updateMask.fieldPaths\": Cannot bind query parameter. Field 'updateMask' could not be found in request message."
          }
        ]
      }
    ]
  }
}
```