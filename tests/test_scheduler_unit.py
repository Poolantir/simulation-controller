from app.events import EventBus
from app.node_transport import MockNodeTransport
from app.persistence import NoopPersistence
from app.scheduler import SchedulerService
from app.state import RuntimeState


def test_queue_delta_rejects_negative_underflow():
    state = RuntimeState()
    try:
        state.apply_queue_delta(-1, 0)
        assert False
    except ValueError:
        assert True


def test_scheduler_assigns_pee_to_urinal_nodes():
    state = RuntimeState()
    state.register_node(node_id="u1", fixture_type="urinal")
    state.apply_queue_delta(pee_delta=1, poo_delta=0)

    scheduler = SchedulerService(
        state=state,
        event_bus=EventBus(),
        transport=MockNodeTransport(),
        persistence=NoopPersistence(),
    )
    scheduler.schedule_tick()
    assignments = list(state.assignments.values())
    assert len(assignments) == 1
    assert assignments[0].usage_type.value == "pee"
    assert assignments[0].node_id == "u1"

