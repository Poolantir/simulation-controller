"""Non-blocking InfluxDB v2 write layer for user-cycle points.

Uses a bounded in-process queue and a single background daemon thread
so scheduler callbacks never block on network I/O.  Transient write
failures are retried with short exponential backoff; if the queue fills
up the oldest point is dropped (with a warning).
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from dataclasses import dataclass
from typing import Optional

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

log = logging.getLogger("influx")

MEASUREMENT = "user_cycle"
MAX_QUEUE = 512
MAX_RETRIES = 3
RETRY_BASE_S = 0.5


@dataclass(frozen=True)
class UserCycleRecord:
    restroom: str
    node_id: int
    toilet_type: str
    duration_s: float
    run_id: str
    user_id: str
    mode: str


class InfluxWriter:
    """Best-effort, non-blocking InfluxDB point writer."""

    def __init__(
        self,
        *,
        url: Optional[str] = None,
        token: Optional[str] = None,
        org: Optional[str] = None,
        bucket: Optional[str] = None,
    ) -> None:
        self._url = (url or os.getenv("INFLUX_URL", "")).rstrip("/")
        self._token = token or os.getenv("INFLUX_TOKEN", "")
        self._org = org or os.getenv("INFLUX_ORG", "")
        self._bucket = bucket or os.getenv("INFLUX_BUCKET", "")
        self._q: queue.Queue[UserCycleRecord] = queue.Queue(maxsize=MAX_QUEUE)
        self._stop = threading.Event()
        self._client: Optional[InfluxDBClient] = None
        self._write_count = 0

        if not self._url or not self._token:
            log.warning("INFLUX_URL or INFLUX_TOKEN not set; writes will be no-ops")
        else:
            log.info(
                "InfluxDB configured: url=%s bucket=%s org=%s measurement=%s",
                self._url, self._bucket, self._org, MEASUREMENT,
            )

        self._thread = threading.Thread(
            target=self._run, name="influx-writer", daemon=True
        )
        self._thread.start()

    # -- public API ----------------------------------------------------

    def write_user_cycle(self, record: UserCycleRecord) -> None:
        """Enqueue a point (non-blocking). Drops oldest on overflow."""
        log.info(
            "enqueue point: restroom=%s node=%d type=%s dur=%.1fs mode=%s",
            record.restroom, record.node_id, record.toilet_type,
            record.duration_s, record.mode,
        )
        try:
            self._q.put_nowait(record)
        except queue.Full:
            try:
                self._q.get_nowait()
            except queue.Empty:
                pass
            try:
                self._q.put_nowait(record)
            except queue.Full:
                pass
            log.warning("influx queue full; dropped oldest point")

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5.0)
        if self._client:
            self._client.close()

    # -- background worker ---------------------------------------------

    def _ensure_client(self) -> Optional[InfluxDBClient]:
        if self._client is not None:
            return self._client
        if not self._url or not self._token:
            return None
        self._client = InfluxDBClient(
            url=self._url, token=self._token, org=self._org
        )
        return self._client

    def _run(self) -> None:
        log.info("influx writer thread started")
        while not self._stop.is_set():
            try:
                record = self._q.get(timeout=1.0)
            except queue.Empty:
                continue

            point = (
                Point(MEASUREMENT)
                .tag("restroom", record.restroom)
                .tag("toilet_type", record.toilet_type)
                .tag("run_id", record.run_id)
                .tag("user_id", record.user_id)
                .tag("mode", record.mode)
                .field("node_id", record.node_id)
                .field("duration_s", float(record.duration_s))
                .time(time.time_ns(), WritePrecision.NS)
            )

            self._write_with_retry(point)
        log.info("influx writer thread stopped")

    def _write_with_retry(self, point: Point) -> None:
        client = self._ensure_client()
        if client is None:
            return
        write_api = client.write_api(write_options=SYNCHRONOUS)
        for attempt in range(MAX_RETRIES):
            try:
                write_api.write(bucket=self._bucket, record=point)
                self._write_count += 1
                log.info("influx write OK (total: %d)", self._write_count)
                return
            except Exception:
                if attempt == MAX_RETRIES - 1:
                    log.exception("influx write FAILED after %d retries", MAX_RETRIES)
                else:
                    backoff = RETRY_BASE_S * (2 ** attempt)
                    log.warning(
                        "influx write attempt %d failed; retrying in %.1fs",
                        attempt + 1,
                        backoff,
                    )
                    time.sleep(backoff)
