# AI-ASSISTED
# Simulation Controller
# Matt Krueger, April 2026 

from __future__ import annotations

import collections
import logging
import threading
from typing import Callable, List

log = logging.getLogger("server_log")

LogSubscriber = Callable[[str], None]

_lock = threading.Lock()
_subscribers: List[LogSubscriber] = []
_ring: collections.deque = collections.deque(maxlen=200)


def publish_line(line: str) -> None:
    """Publish a single spec-formatted log line."""
    log.info(line)
    with _lock:
        _ring.append(line)
        subs = list(_subscribers)
    for cb in subs:
        try:
            cb(line)
        except Exception:
            log.exception("server_log subscriber raised")


def subscribe(cb: LogSubscriber) -> Callable[[], None]:
    """Register a subscriber. Returns an unsubscribe callable."""
    with _lock:
        _subscribers.append(cb)

    def unsubscribe() -> None:
        with _lock:
            try:
                _subscribers.remove(cb)
            except ValueError:
                pass

    return unsubscribe


def replay() -> List[str]:
    """Return a copy of the ring buffer for SSE hydration."""
    with _lock:
        return list(_ring)
