from app.events import EventBus
from app.node_transport import MockNodeTransport
from app.persistence import NoopPersistence
from app.scheduler import SchedulerService
from app.state import RuntimeState


def test_watchdog_marks_stale_nodes_offline():
    state = RuntimeState()
    node = state.register_node(node_id="n1", fixture_type="stall")
    node.last_heartbeat_at = "1970-01-01T00:00:00+00:00"
    scheduler = SchedulerService(
        state=state,
        event_bus=EventBus(),
        transport=MockNodeTransport(),
        persistence=NoopPersistence(),
    )
    scheduler.watchdog(heartbeat_timeout_sec=1)
    assert state.nodes["n1"].status.value == "out_of_order"


def test_burst_queue_is_processed_for_available_nodes():
    state = RuntimeState()
    state.register_node(node_id="u1", fixture_type="urinal")
    state.register_node(node_id="u2", fixture_type="urinal")
    state.apply_queue_delta(pee_delta=20, poo_delta=0)
    scheduler = SchedulerService(
        state=state,
        event_bus=EventBus(),
        transport=MockNodeTransport(),
        persistence=NoopPersistence(),
    )
    scheduler.schedule_tick()
    assert len(state.assignments) == 2
    assert state.queue.pending_pee == 18

