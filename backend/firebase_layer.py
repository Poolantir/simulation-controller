# AI-ASSISTED
# Simulation Controller
# Matt Krueger, April 2026

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, List, Optional, Sequence

import requests as _requests
from google.auth.transport.requests import Request as _AuthRequest
from google.oauth2 import service_account as _service_account

log = logging.getLogger("firebase")

FIREBASE_API_KEY = os.getenv("VITE_FIREBASE_API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("VITE_FIREBASE_PROJECT_ID", "")
FIREBASE_DATABASE_ID = os.getenv("VITE_FIREBASE_DATABASE_ID", "")

_BASE = (
    f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}"
    f"/databases/{FIREBASE_DATABASE_ID}"
)
_QUERY_URL = f"{_BASE}/documents:runQuery"

_enabled: bool = all((FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_DATABASE_ID))

if not _enabled:
    log.warning("Firebase env vars missing — writes disabled")

_SCOPES = ["https://www.googleapis.com/auth/datastore"]
_credentials: Optional[_service_account.Credentials] = None
_cred_lock = threading.Lock()

_sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
if _sa_path and os.path.isfile(_sa_path):
    _credentials = _service_account.Credentials.from_service_account_file(
        _sa_path, scopes=_SCOPES
    )
    log.info("loaded service account from %s", _sa_path)
elif _enabled:
    log.warning(
        "GOOGLE_APPLICATION_CREDENTIALS not set or file missing — "
        "Firestore calls will fall back to API-key-only (may 403 on writes)"
    )


def _auth_headers() -> Dict[str, str]:
    """Return Authorization header if service account is available."""
    if _credentials is None:
        return {}
    with _cred_lock:
        if not _credentials.valid:
            _credentials.refresh(_AuthRequest())
        return {"Authorization": f"Bearer {_credentials.token}"}

ALL_NODE_IDS: List[str] = [
    "TST-1", "TST-2", "TST-3",
    "TUR-1", "TUR-2", "TUR-3",
]

_EVENT_TO_STATUS: Dict[str, str] = {
    "in_use": "in_use",
    "vacant": "online",
    "online": "online",
    "offline": "offline",
}


def fixture_to_node_id(fixture_id: int, kind: str, toilet_types: Sequence[str]) -> str:
    """Map a 1-based fixture id + kind to its Firebase node id (e.g. TST-2, TUR-1)."""
    prefix = "TST" if kind == "stall" else "TUR"
    nth = 0
    for i, t in enumerate(toilet_types):
        if str(t).lower() == kind:
            nth += 1
            if i + 1 == fixture_id:
                return f"{prefix}-{nth}"
    return f"{prefix}-{fixture_id}"


def send_event(node_id: str, event: str) -> None:
    """Fire-and-forget: update stalls.status in Firestore."""
    if not _enabled:
        return
    threading.Thread(
        target=_do_send_event, args=(node_id, event), daemon=True
    ).start()


def send_all_nodes(event: str) -> None:
    """Send same event to every known node (mode switches)."""
    if not _enabled:
        return
    threading.Thread(
        target=_do_send_all, args=(event,), daemon=True
    ).start()


def _do_send_event(node_id: str, event: str) -> None:
    _update_stall_status(node_id, _EVENT_TO_STATUS.get(event, event))


def _do_send_all(event: str) -> None:
    for nid in ALL_NODE_IDS:
        _do_send_event(nid, event)


def _find_stall_doc(node_id: str) -> Optional[str]:
    """Query stalls collection for doc where nodeId == node_id. Return doc path or None."""
    query = {
        "structuredQuery": {
            "from": [{"collectionId": "stalls"}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "nodeId"},
                    "op": "EQUAL",
                    "value": {"stringValue": node_id},
                }
            },
            "limit": 1,
        }
    }
    try:
        r = _requests.post(_QUERY_URL, json=query, headers=_auth_headers(), timeout=5)
        r.raise_for_status()
        results = r.json()
        for entry in results:
            doc = entry.get("document")
            if doc:
                return doc["name"]
    except _requests.HTTPError as e:
        body = e.response.text[:300] if e.response is not None else ""
        log.error("stall query failed for %s — %s %s", node_id, e, body)
    except Exception:
        log.exception("stall query failed for %s", node_id)
    return None


def _update_stall_status(node_id: str, status: str) -> None:
    doc_path = _find_stall_doc(node_id)
    if doc_path is None:
        log.warning("no stall doc found for nodeId=%s, skipping status update", node_id)
        return
    url = f"https://firestore.googleapis.com/v1/{doc_path}"
    payload: Dict[str, Any] = {
        "fields": {
            "status": {"stringValue": status},
        }
    }
    try:
        r = _requests.patch(
            url,
            json=payload,
            params={"updateMask.fieldPaths": "status"},
            headers=_auth_headers(),
            timeout=5,
        )
        r.raise_for_status()
        log.info("stall updated: %s -> %s", node_id, status)
    except _requests.HTTPError as e:
        body = e.response.text[:300] if e.response is not None else ""
        log.error("stall status update failed: %s -> %s — %s %s", node_id, status, e, body)
    except Exception:
        log.exception("stall status update failed: %s -> %s", node_id, status)
