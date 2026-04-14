from app.main import create_app
from app.security import RateLimiter


def test_rate_limiter_blocks_over_limit():
    limiter = RateLimiter(max_requests=2, window_sec=60)
    assert limiter.allow("client-a")
    assert limiter.allow("client-a")
    assert not limiter.allow("client-a")


def test_snapshot_persists_after_mutation(tmp_path):
    snapshot_file = tmp_path / "state.json"
    app = create_app()
    app.extensions["snapshot_store"].path = str(snapshot_file)
    client = app.test_client()

    client.post("/api/v1/nodes/register", json={"node_id": "persist-1", "fixture_type": "stall"})
    assert snapshot_file.exists()

