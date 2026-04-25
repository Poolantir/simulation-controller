## Pseudocode — Non-blocking Two-Pass Scheduler

### Data structures

```
class User:
    use_type:       "pee" | "poo"
    duration:       float           // pre-sampled at enqueue
    prefers_stall:  bool            // pee only; sampled from shy_peer_pct

cleanliness_map = { clean:1, fair:0.75, dirty:0.5, horrendous:0.1, out-of-order:0 }

fixtures[1..6]:  { kind, condition, in_use, reserved }
queue:           FIFO list of Users
```

### Etiquette shares (layout-aware, single group)

Given a 3-slot group (e.g. stalls [left, middle, right]):
- All 3 free:         left = (1−m)/2,  middle = m,  right = (1−m)/2
- 1 outer + middle:   outer = 0.98,    middle = 0.02
- Middle only:        middle = 1.0
- Outers only:        50/50

Where m = middle_toilet_first_choice_pct / 100.

2-slot groups (Seamen Center): equal split, no middle rule.

### Sequential cleanliness evaluation (pick_sequential)

```
pick_sequential(shares, conditions):
    candidates = copy(shares)        // {idx: etiquette_share}
    while candidates not empty:
        chosen = weighted_sample(candidates)
        tc = cleanliness_map[conditions[chosen]]
        if random() < tc:
            return chosen            // ACCEPTED
        remove chosen from candidates
        // re-normalize happens implicitly via weighted_sample on remaining
    return None                      // ALL REJECTED
```

Reject probabilities (3 fixtures, all same condition):
- Clean:      0                (never reject)
- Fair:       (1−0.75)^3 ≈ 0.016
- Dirty:      (1−0.5)^3  = 0.125
- Horrendous: (1−0.1)^3  = 0.729

### Main tick loop (non-blocking)

```
each tick:
    release_completed_fixtures()
    commit_mature_reservations()     // preview → in_use

    free_urinals = free fixtures of kind "urinal"
    free_stalls  = free fixtures of kind "stall"
    conds        = current condition map

    // ---- URINAL PASS (non-shy pee users) ----
    for user in queue (FIFO):
        skip if already reserved
        skip if user.type != "pee" or user.prefers_stall
        if no free_urinals: break

        shares = etiquette_shares(urinal group, free_urinals, conds)
        if no shares: break          // all OoO

        pick = pick_sequential(shares, conds)
        if pick != None:
            reserve(pick, user)
            remove pick from free_urinals
        else:
            break                    // pee WAITS — stop urinal pass

    // ---- STALL PASS (poo + shy pee, FIFO) ----
    for user in queue (FIFO):
        skip if already reserved
        skip if user.type == "pee" and not user.prefers_stall
        if no free_stalls: break

        shares = etiquette_shares(stall group, free_stalls, conds)
        if no shares: break          // all OoO

        pick = pick_sequential(shares, conds)
        if pick != None:
            reserve(pick, user)
            remove pick from free_stalls
        else:
            EXIT user from queue     // rejected all stalls → leave restroom

    expire_queue_timeouts()          // 10s sim-time hard cap
```

### Key behaviors

1. **Non-blocking**: pee users reach urinals even when poo ahead can't find stalls.
2. **Stall priority**: FIFO within stall pass; poo before pee gets stall first.
3. **Reject → exit (stalls)**: poo or shy-pee who reject all stalls leave immediately.
4. **Reject → wait (urinals)**: non-shy pee who reject urinals stay queued for better one.
5. **Shy pee sampling**: at enqueue, `prefers_stall = random() < shy_peer_pct/100`.
   Shy pee-ers only compete for stalls; non-shy only compete for urinals.
6. **No forced normalization**: cleanliness creates real opt-out probability instead
   of redistributing weight to bad fixtures.
