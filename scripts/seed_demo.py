from app.main import create_app


def run_seed() -> None:
    app = create_app()
    with app.app_context():
        state = app.extensions["state"]
        state.update_config({"stalls": 3, "urinals": 3, "pee_duration_sec": 20, "poo_duration_sec": 300})
        state.register_node("urinal-node-1", "urinal", {"fw": "v1"})
        state.register_node("urinal-node-2", "urinal", {"fw": "v1"})
        state.register_node("stall-node-1", "stall", {"fw": "v1"})
        state.register_node("stall-node-2", "stall", {"fw": "v1"})
        state.apply_queue_delta(pee_delta=6, poo_delta=2)
        app.extensions["scheduler"].schedule_tick()
        print("Seed complete.")


if __name__ == "__main__":
    run_seed()

