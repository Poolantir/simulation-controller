from __future__ import annotations

import json
import os
import threading
from typing import Any


class SnapshotStore:
    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()

    def save(self, payload: dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = f"{self.path}.tmp"
        with self._lock:
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
            os.replace(tmp, self.path)

    def load(self) -> dict[str, Any] | None:
        if not os.path.exists(self.path):
            return None
        with self._lock:
            with open(self.path, "r", encoding="utf-8") as handle:
                return json.load(handle)

