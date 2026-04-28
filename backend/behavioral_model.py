# AI-ASSISTED
# Simulation Controller
# Matt Krueger, April 2026 

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

T_C_BY_CONDITION: Dict[str, float] = {
    "Clean": 1.0,
    "Fair": 0.75,
    "Dirty": 0.5,
    "Horrendous": 0.1,
    "In-Use": 0.0,
    "Out-of-Order": 0.0,
    "Currently Being Cleaned": 0.0,
    "Non-Existent": 0.0,
}


def toilet_cleanliness_weight(condition: str | None) -> float:
    if condition is None:
        return 1.0
    return T_C_BY_CONDITION.get(condition, 1.0)


def _group_indices(toilet_types: Sequence[str], kind: str) -> List[int]:
    return [i for i, t in enumerate(toilet_types) if str(t).lower() == kind]


def _layout_shares(
    group_indices: Sequence[int],
    free_indices_in_group: Sequence[int],
    middle_pct: float,
) -> Dict[int, float]:
    if not free_indices_in_group:
        return {}

    m = max(0.0, min(100.0, float(middle_pct))) / 100.0
    n = len(group_indices)

    if n == 3:
        middle_idx = group_indices[1]
        outer_idxs = [group_indices[0], group_indices[2]]
        free_middle = middle_idx in free_indices_in_group
        free_outers = [i for i in outer_idxs if i in free_indices_in_group]
        if free_middle and free_outers:
            outer_share = (1.0 - m) / len(free_outers)
            shares = {i: outer_share for i in free_outers}
            shares[middle_idx] = m
            return shares
        if free_middle and not free_outers:
            return {middle_idx: 1.0}
        per = 1.0 / len(free_outers)
        return {i: per for i in free_outers}

    per = 1.0 / len(free_indices_in_group)
    return {i: per for i in free_indices_in_group}


def compute_candidate_weights(
    *,
    toilet_types: Sequence[str],
    conditions_by_index: Dict[int, str],
    free_indices: Sequence[int],
    user_type: str,
    shy_peer_pct: float,
    middle_pct: float,
) -> Dict[int, float]:
    u = str(user_type).lower()
    if u not in ("pee", "poo"):
        return {}

    stall_idx = _group_indices(toilet_types, "stall")
    urinal_idx = _group_indices(toilet_types, "urinal")

    free_set = set(free_indices)

    def tc(i: int) -> float:
        return toilet_cleanliness_weight(conditions_by_index.get(i, "Clean"))

    free_stalls = [i for i in stall_idx if i in free_set and tc(i) > 0]
    free_urinals = [i for i in urinal_idx if i in free_set and tc(i) > 0]

    if u == "poo":
        group_prob_stall = 1.0 if free_stalls else 0.0
        group_prob_urinal = 0.0
    else:
        if not free_stalls and not free_urinals:
            return {}
        if not free_stalls:
            group_prob_stall = 0.0
            group_prob_urinal = 1.0
        elif not free_urinals:
            group_prob_stall = 1.0
            group_prob_urinal = 0.0
        else:
            shy = max(0.0, min(100.0, float(shy_peer_pct))) / 100.0
            group_prob_stall = shy
            group_prob_urinal = 1.0 - shy

    if group_prob_stall == 0.0 and group_prob_urinal == 0.0:
        return {}

    def _weight_group(
        group_idx: Sequence[int],
        free_in_group: Sequence[int],
    ) -> Dict[int, float]:
        if not free_in_group:
            return {}
        shares = _layout_shares(group_idx, free_in_group, middle_pct)
        weighted: Dict[int, float] = {}
        for i, s in shares.items():
            weighted[i] = s * tc(i)
        total = sum(weighted.values())
        if total <= 0:
            return {}
        return {i: w / total for i, w in weighted.items()}

    stall_weights = _weight_group(stall_idx, free_stalls)
    urinal_weights = _weight_group(urinal_idx, free_urinals)

    if u == "pee":
        if not stall_weights and urinal_weights:
            group_prob_stall, group_prob_urinal = 0.0, 1.0
        elif not urinal_weights and stall_weights:
            group_prob_stall, group_prob_urinal = 1.0, 0.0

    merged: Dict[int, float] = {}
    if group_prob_stall > 0:
        for i, w in stall_weights.items():
            if w <= 0:
                continue
            merged[i] = merged.get(i, 0.0) + group_prob_stall * w
    if group_prob_urinal > 0:
        for i, w in urinal_weights.items():
            if w <= 0:
                continue
            merged[i] = merged.get(i, 0.0) + group_prob_urinal * w

    total = sum(merged.values())
    if total <= 0:
        return {}
    return {i: w / total for i, w in merged.items()}


def compute_group_etiquette_shares(
    *,
    toilet_types: Sequence[str],
    conditions_by_index: Dict[int, str],
    free_indices: Sequence[int],
    middle_pct: float,
    group_kind: str,
) -> Dict[int, float]:
    group_idx = _group_indices(toilet_types, group_kind)
    free_set = set(free_indices)
    free_in_group = [
        i
        for i in group_idx
        if i in free_set
        and toilet_cleanliness_weight(conditions_by_index.get(i, "Clean")) > 0
    ]
    if not free_in_group:
        return {}
    return _layout_shares(group_idx, free_in_group, middle_pct)


def pick_sequential(
    shares: Dict[int, float],
    conditions_by_index: Dict[int, str],
    rng,
) -> int | None:
    candidates = dict(shares)
    while candidates:
        total = sum(candidates.values())
        if total <= 0:
            return None
        r = rng.random() * total
        acc = 0.0
        chosen = None
        for idx, share in candidates.items():
            acc += share
            if r <= acc:
                chosen = idx
                break
        if chosen is None:
            chosen = list(candidates.keys())[-1]

        tc = toilet_cleanliness_weight(conditions_by_index.get(chosen, "Clean"))
        if rng.random() < tc:
            return chosen

        del candidates[chosen]

    return None


def pick_weighted(weights: Dict[int, float], rng) -> int | None:
    if not weights:
        return None
    r = rng.random()
    acc = 0.0
    last_key = None
    for k, w in weights.items():
        acc += w
        last_key = k
        if r <= acc:
            return k
    return last_key


def empty_conditions_for_types(toilet_types: Sequence[str]) -> Dict[int, str]:
    out: Dict[int, str] = {}
    for i, t in enumerate(toilet_types):
        out[i] = "Non-Existent" if str(t).lower() == "nonexistent" else "Clean"
    return out


def conditions_from_frontend_payload(
    toilet_types: Sequence[str],
    restroom_conditions: Dict | None,
) -> Dict[int, str]:
    if not restroom_conditions:
        return empty_conditions_for_types(toilet_types)
    out = empty_conditions_for_types(toilet_types)
    for bucket in ("stalls", "urinals"):
        entries = restroom_conditions.get(bucket) or []
        for e in entries:
            try:
                idx = int(e["id"]) - 1
            except (KeyError, TypeError, ValueError):
                continue
            if 0 <= idx < len(toilet_types):
                cond = e.get("condition", "Clean")
                if str(toilet_types[idx]).lower() == "nonexistent":
                    out[idx] = "Non-Existent"
                else:
                    out[idx] = cond
    return out


__all__ = [
    "toilet_cleanliness_weight",
    "compute_candidate_weights",
    "compute_group_etiquette_shares",
    "pick_sequential",
    "pick_weighted",
    "empty_conditions_for_types",
    "conditions_from_frontend_payload",
    "T_C_BY_CONDITION",
]
