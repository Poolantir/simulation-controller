from app.main import create_app


def test_state_endpoint():
    app = create_app()
    client = app.test_client()
    resp = client.get("/api/v1/state")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "config" in data
    assert "queue" in data


def test_register_and_queue_flow():
    app = create_app()
    client = app.test_client()

    register_resp = client.post(
        "/api/v1/nodes/register",
        json={"node_id": "node-1", "fixture_type": "urinal"},
    )
    assert register_resp.status_code == 201

    delta_resp = client.post(
        "/api/v1/demand/delta",
        json={"pee_delta": 1, "poo_delta": 0},
        headers={"Idempotency-Key": "abc-123"},
    )
    assert delta_resp.status_code == 200

    state_resp = client.get("/api/v1/state")
    data = state_resp.get_json()
    assert len(data["assignments"]) >= 1


def test_api_token_protects_mutation_routes():
    app = create_app()
    app.config["API_AUTH_TOKEN"] = "secret"
    client = app.test_client()

    unauthorized = client.post("/api/v1/demand/delta", json={"pee_delta": 1, "poo_delta": 0})
    assert unauthorized.status_code == 401

    authorized = client.post(
        "/api/v1/demand/delta",
        json={"pee_delta": 1, "poo_delta": 0},
        headers={"Authorization": "Bearer secret"},
    )
    assert authorized.status_code == 200


def test_node_token_protects_node_routes():
    app = create_app()
    app.config["NODE_AUTH_TOKEN"] = "node-secret"
    client = app.test_client()

    unauthorized = client.post("/api/v1/nodes/register", json={"node_id": "x1", "fixture_type": "stall"})
    assert unauthorized.status_code == 401

    authorized = client.post(
        "/api/v1/nodes/register",
        json={"node_id": "x1", "fixture_type": "stall"},
        headers={"X-Node-Token": "node-secret"},
    )
    assert authorized.status_code == 201

