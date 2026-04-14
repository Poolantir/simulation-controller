from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_requests: int, window_sec: int) -> None:
        self.max_requests = max_requests
        self.window_sec = window_sec
        self._lock = threading.Lock()
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        min_ts = now - self.window_sec
        with self._lock:
            bucket = self._calls[key]
            while bucket and bucket[0] < min_ts:
                bucket.popleft()
            if len(bucket) >= self.max_requests:
                return False
            bucket.append(now)
            return True

