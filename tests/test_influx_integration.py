from __future__ import annotations

from app.influx_contract import canonicalize_restroom_id, normalize_usage_payload
from app.main import create_app
from app.persistence import InfluxPersistence


class SpyPersistence:
    def __init__(self) -> None:
        self.usage: list[dict] = []
        self.sim_events: list[tuple[str, dict]] = []

    def write_event(self, event_type, payload):
        return None

    def write_assignment(self, assignment):
        return None

    def write_incident(self, incident):
        return None

    def write_restroom_usage(self, usage):
        self.usage.append(usage)

    def write_simulation_event(self, event_type, payload):
        self.sim_events.append((event_type, payload))


def test_restroom_alias_canonicalization():
    assert canonicalize_restroom_id("seamen") == "seamans_f1_mens"
    assert canonicalize_restroom_id("maclean") == "maclean_f2_mens"


def test_usage_payload_validation_and_normalization():
    record = normalize_usage_payload(
        {
            "restroom": "seamen",
            "node_id": 4,
            "toilet_type": "stall",
            "duration_s": 87.5,
        },
        source="simulation",
    )
    payload = record.as_payload()
    assert payload["restroom_id"] == "seamans_f1_mens"
    assert payload["event_version"] == "v1"
    assert payload["duration_s"] == 87.5


def test_influx_measurement_parts_include_tags_and_payload():
    tags, fields = InfluxPersistence.build_measurement_parts(
        measurement="restroom_usage",
        payload={
            "restroom_id": "seamans_f1_mens",
            "node_id": 2,
            "toilet_type": "stall",
            "duration_s": 42.0,
            "source": "simulation",
        },
        extra_tags={"restroom_id": "seamans_f1_mens", "source": "simulation"},
    )
    assert tags["restroom_id"] == "seamans_f1_mens"
    assert tags["source"] == "simulation"
    assert "payload_json" in fields
    assert fields["duration_s"] == 42.0


def test_ingest_usage_endpoint_writes_usage_and_sim_events():
    app = create_app()
    spy = SpyPersistence()
    app.extensions["persistence"] = spy
    client = app.test_client()

    resp = client.post(
        "/api/v1/simulation/usage",
        json={
            "source": "simulation",
            "events": [
                {"restroom": "seamen", "node_id": 1, "toilet_type": "stall", "duration_s": 50.0},
                {"restroom": "maclean", "node_id": 5, "toilet_type": "urinal", "duration_s": 24.1},
            ],
        },
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["ingested"] == 2
    assert len(spy.usage) == 2
    assert len(spy.sim_events) == 2
    assert spy.usage[0]["restroom_id"] == "seamans_f1_mens"


def test_dummy_generation_endpoint_writes_anomaly_records():
    app = create_app()
    spy = SpyPersistence()
    app.extensions["persistence"] = spy
    client = app.test_client()

    resp = client.post(
        "/api/v1/simulation/dummy/generate",
        json={"count": 5, "seed": 7, "restroom": "maclean"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["generated"] == 5
    assert len(spy.usage) == 5
    assert all(item["restroom_id"] == "maclean_f2_mens" for item in spy.usage)
    assert all(item["source"] == "dummy" for item in spy.usage)
