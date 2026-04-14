from app.main import create_app


def run_check() -> None:
    app = create_app()
    client = app.test_client()

    client.post("/api/v1/nodes/register", json={"node_id": "u1", "fixture_type": "urinal"})
    client.post("/api/v1/nodes/register", json={"node_id": "s1", "fixture_type": "stall"})
    client.post("/api/v1/demand/delta", json={"pee_delta": 10, "poo_delta": 2})
    state = client.get("/api/v1/state").get_json()

    assert state["queue"]["pending_pee"] >= 0
    assert len(state["assignments"]) >= 1
    print("Demo check passed.")


if __name__ == "__main__":
    run_check()

