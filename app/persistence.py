from __future__ import annotations

import os
from dataclasses import asdict
from typing import Any

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except Exception:  # pragma: no cover
    firebase_admin = None
    credentials = None
    firestore = None


class PersistenceWriter:
    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        raise NotImplementedError

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        raise NotImplementedError

    def write_incident(self, incident: dict[str, Any]) -> None:
        raise NotImplementedError


class NoopPersistence(PersistenceWriter):
    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        return

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        return

    def write_incident(self, incident: dict[str, Any]) -> None:
        return


class FirestorePersistence(PersistenceWriter):
    def __init__(self, credential_path: str) -> None:
        if not firebase_admin or not credentials or not firestore:
            raise RuntimeError("firebase-admin not installed")
        if not firebase_admin._apps:
            cred = credentials.Certificate(credential_path)
            firebase_admin.initialize_app(cred)
        self.db = firestore.client()

    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        self.db.collection("events").add(
            {
                "event_type": event_type,
                "payload": payload,
            }
        )

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        self.db.collection("assignments").document(assignment["assignment_id"]).set(assignment)

    def write_incident(self, incident: dict[str, Any]) -> None:
        self.db.collection("incidents").document(incident["incident_id"]).set(incident)


def create_persistence_writer() -> PersistenceWriter:
    credential_path = os.getenv("FIREBASE_CREDENTIAL_PATH", "").strip()
    if not credential_path:
        return NoopPersistence()
    return FirestorePersistence(credential_path=credential_path)

