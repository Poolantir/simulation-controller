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

    def write_restroom_usage(self, usage: dict[str, Any]) -> None:
        raise NotImplementedError

    def write_simulation_event(self, event_type: str, payload: dict[str, Any]) -> None:
        raise NotImplementedError


class NoopPersistence(PersistenceWriter):
    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        return

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        return

    def write_incident(self, incident: dict[str, Any]) -> None:
        return

    def write_restroom_usage(self, usage: dict[str, Any]) -> None:
        return

    def write_simulation_event(self, event_type: str, payload: dict[str, Any]) -> None:
        return


class InfluxPersistence(PersistenceWriter):
    def __init__(self, url: str, token: str, org: str, bucket: str) -> None:
        if not InfluxDBClient or not Point or not WriteOptions:
            raise RuntimeError("influxdb-client not installed")
        self.bucket = bucket
        self.org = org
        self.client = InfluxDBClient(url=url, token=token, org=org)
        self.write_api = self.client.write_api(write_options=WriteOptions(batch_size=1, flush_interval=500))

    @staticmethod
    def build_measurement_parts(
        measurement: str,
        payload: dict[str, Any],
        identity_field: str | None = None,
        extra_tags: dict[str, str] | None = None,
    ) -> tuple[dict[str, str], dict[str, Any]]:
        tags: dict[str, str] = {}
        fields: dict[str, Any] = {"payload_json": json.dumps(payload)}
        if identity_field and payload.get(identity_field):
            tags["id"] = str(payload.get(identity_field))
        if payload.get("status"):
            tags["status"] = str(payload.get("status"))
        if extra_tags:
            tags.update({k: str(v) for k, v in extra_tags.items() if v is not None})
        for key, value in payload.items():
            if isinstance(value, (int, float, bool)):
                fields[key] = value
            elif isinstance(value, str):
                fields[key] = value[:500]
        return tags, fields

    def _write_measurement(self, measurement: str, payload: dict[str, Any], identity_field: str | None = None) -> None:
        self._write_measurement_with_tags(measurement, payload, identity_field=identity_field, extra_tags=None)

    def _write_measurement_with_tags(
        self,
        measurement: str,
        payload: dict[str, Any],
        identity_field: str | None = None,
        extra_tags: dict[str, str] | None = None,
    ) -> None:
        tags, fields = self.build_measurement_parts(
            measurement=measurement,
            payload=payload,
            identity_field=identity_field,
            extra_tags=extra_tags,
        )
        point = Point(measurement)
        for key, value in tags.items():
            point = point.tag(key, value)
        for key, value in fields.items():
            point = point.field(key, value)
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def write_event(self, event_type: str, payload: dict[str, Any]) -> None:
        event_payload = {"event_type": event_type, **payload}
        self._write_measurement("events", event_payload)

    def write_assignment(self, assignment: dict[str, Any]) -> None:
        self._write_measurement("assignments", assignment, identity_field="assignment_id")

    def write_incident(self, incident: dict[str, Any]) -> None:
        self._write_measurement("incidents", incident, identity_field="incident_id")

    def write_restroom_usage(self, usage: dict[str, Any]) -> None:
        self._write_measurement_with_tags(
            "restroom_usage",
            usage,
            extra_tags={
                "restroom_id": str(usage.get("restroom_id", "")),
                "toilet_type": str(usage.get("toilet_type", "")),
                "source": str(usage.get("source", "simulation")),
            },
        )

    def write_simulation_event(self, event_type: str, payload: dict[str, Any]) -> None:
        body = {"event_type": event_type, **payload}
        self._write_measurement_with_tags(
            "simulation_events",
            body,
            extra_tags={
                "event_type": event_type,
                "restroom_id": str(payload.get("restroom_id", "")),
                "source": str(payload.get("source", "simulation")),
            },
        )


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

