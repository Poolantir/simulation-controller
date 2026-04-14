from __future__ import annotations

import json
import queue
import threading
from collections import deque
from dataclasses import asdict
from typing import Iterator

from .models import EventEnvelope, iso_now


class EventBus:
    def __init__(self, replay_size: int = 300):
        self._lock = threading.Lock()
        self._sequence = 0
        self._history: deque[EventEnvelope] = deque(maxlen=replay_size)
        self._subscribers: list[queue.Queue[EventEnvelope]] = []

    def publish(self, event_type: str, payload: dict) -> EventEnvelope:
        with self._lock:
            self._sequence += 1
            envelope = EventEnvelope(
                event_type=event_type,
                payload=payload,
                sequence=self._sequence,
                timestamp=iso_now(),
            )
            self._history.append(envelope)
            subscribers = list(self._subscribers)
        for subscriber in subscribers:
            subscriber.put(envelope)
        return envelope

    def replay_since(self, sequence: int) -> list[EventEnvelope]:
        with self._lock:
            return [item for item in self._history if item.sequence > sequence]

    def subscribe(self) -> tuple[queue.Queue[EventEnvelope], callable]:
        q: queue.Queue[EventEnvelope] = queue.Queue()
        with self._lock:
            self._subscribers.append(q)

        def unsubscribe() -> None:
            with self._lock:
                if q in self._subscribers:
                    self._subscribers.remove(q)

        return q, unsubscribe

    def sse_stream(self, last_sequence: int = 0) -> Iterator[str]:
        for event in self.replay_since(last_sequence):
            yield f"data: {json.dumps(asdict(event))}\n\n"

        subscriber, unsubscribe = self.subscribe()
        try:
            while True:
                try:
                    event = subscriber.get(timeout=20)
                    yield f"data: {json.dumps(asdict(event))}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'event_type': 'STREAM_HEARTBEAT', 'timestamp': iso_now()})}\n\n"
        finally:
            unsubscribe()

