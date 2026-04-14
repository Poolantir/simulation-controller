from __future__ import annotations

import os
import json
from typing import Any

try:
    from influxdb_client import InfluxDBClient, Point, WriteOptions
except Exception:  # pragma: no cover
    InfluxDBClient = None
    Point = None
    WriteOptions = None


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


class InfluxPersistence(PersistenceWriter):
    def __init__(self, url: str, token: str, org: str, bucket: str) -> None:
        if not InfluxDBClient or not Point or not WriteOptions:
            raise RuntimeError("influxdb-client not installed")
        self.bucket = bucket
        self.org = org
        self.client = InfluxDBClient(url=url, token=token, org=org)
        self.write_api = self.client.write_api(write_options=WriteOptions(batch_size=1, flush_interval=500))

    def _write_measurement(self, measurement: str, payload: dict[str, Any], identity_field: str | None = None) -> None:
        point = Point(measurement)
        if identity_field and payload.get(identity_field):
            point = point.tag("id", str(payload.get(identity_field)))
        if payload.get("status"):
            point = point.tag("status", str(payload.get("status")))
        point = point.field("payload_json", json.dumps(payload))
        for key, value in payload.items():
            if isinstance(value, (int, float, bool)):
                point = point.field(key, value)
            elif isinstance(value, str):
                point = point.field(key, value[:500])
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        event_payload = {"event_type": event_type, **payload}
        self._write_measurement("events", event_payload)

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        self._write_measurement("assignments", assignment, identity_field="assignment_id")

    def write_incident(self, incident: dict[str, Any]) -> None:
        self._write_measurement("incidents", incident, identity_field="incident_id")


def create_persistence_writer() -> PersistenceWriter:
    influx_url = os.getenv("INFLUXDB_URL", "").strip()
    influx_token = os.getenv("INFLUXDB_TOKEN", "").strip()
    influx_org = os.getenv("INFLUXDB_ORG", "").strip()
    influx_bucket = os.getenv("INFLUXDB_BUCKET", "").strip()
    if not (influx_url and influx_token and influx_org and influx_bucket):
        return NoopPersistence()
    return InfluxPersistence(
        url=influx_url,
        token=influx_token,
        org=influx_org,
        bucket=influx_bucket,
    )

