"""
Behavioral model weighting for the Dummy Mode scheduler.

Mirrors the frontend `behavioralModel.js` rules, but specialised for
*live scheduling*: given the current fixture layout, per-fixture
cleanliness, and the set of currently-free fixtures, produce a weighted
distribution over candidate fixtures that a new user could be assigned
to.

Rules
-----
- Poo-ers only use stalls. If no stall is free (or none exist), the
  user waits.
- Pee-ers prefer urinals; the stall-vs-urinal split is driven by
  `shy_peer_pct`. When only one group has any free-and-existing
  fixture, the whole probability mass goes to that group.
- Within a 3-slot group, the "middle toilet as first choice" rule
  (`middle_pct`) is preserved even when some siblings are occupied:
    * free middle + >=1 free outer: outers share (1 - m), middle m.
    * free middle only: middle gets 1.
    * free outers only: split equally (50/50 in the 3-slot case, which
      matches the spec: "middle chosen while both outers open -> 50-50
      between the two outers").
- Groups with 2 slots (e.g. Seamen Center) have no middle -> share
  equally. Groups with 1 slot get 1. Group with 0 slots is ignored.
- Non-existent slots and occupied slots are excluded from the
  candidate set before weighting.
- Toilet-cleanliness weight (T.C) is applied multiplicatively to each
  candidate before normalisation. Fixtures with T.C==0 (Out-of-Order,
  In-Use, Currently Being Cleaned, Non-Existent) are effectively
  excluded.

Sequential evaluation (``pick_sequential``)
-------------------------------------------
The spec describes an "in succession" rule: the user picks a fixture
from the etiquette distribution, then accepts/rejects based on
cleanliness (T.C).  On rejection the fixture is removed from the
candidate set, the etiquette shares re-normalise, and the user tries
again.  Only when *every* candidate is rejected does the user leave
(poo) or wait (pee at urinals).

``compute_group_etiquette_shares`` + ``pick_sequential`` implement
this two-stage model and are used by the scheduler for all Dummy-mode
assignments.
"""

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
    """
    Produce base (pre-T.C) shares for each *free* slot in a group,
    using the middle-first rule when the original group has 3 slots.

    The shares returned always sum to 1.0 (or 0.0 if no free slot).
    """
    if not free_indices_in_group:
        return {}

    m = max(0.0, min(100.0, float(middle_pct))) / 100.0
    n = len(group_indices)

    # 3-slot layout: preserve middle-first semantics based on *original*
    # positions so partially-occupied groups still respect the rule.
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
        # outers only -> split equally (handles "middle is in-use" case,
        # which per spec is a 50/50 between the two remaining outers).
        per = 1.0 / len(free_outers)
        return {i: per for i in free_outers}

    # 2- or 1-slot layout: no middle rule; split equally.
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
    """
    Return normalised weights (summing to 1.0) over the fixture indices
    that a user of `user_type` could be assigned to *right now*.

    `free_indices` must already exclude fixtures that are occupied,
    out-of-order, or non-existent. The function additionally enforces
    T.C>0 so a "Horrendous-but-not-forbidden" fixture still gets a tiny
    slice, while zero-T.C conditions drop out.

    Returns an empty dict when no eligible candidate exists (caller
    should leave the user queued).
    """
    u = str(user_type).lower()
    if u not in ("pee", "poo"):
        return {}

    stall_idx = _group_indices(toilet_types, "stall")
    urinal_idx = _group_indices(toilet_types, "urinal")

    free_set = set(free_indices)

    # Restrict each group's free set + drop T.C==0 entries.
    def tc(i: int) -> float:
        return toilet_cleanliness_weight(conditions_by_index.get(i, "Clean"))

    free_stalls = [i for i in stall_idx if i in free_set and tc(i) > 0]
    free_urinals = [i for i in urinal_idx if i in free_set and tc(i) > 0]

    # Group-probability split (pee vs poo).
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

    # Within-group shares (layout-aware) * T.C, then normalised *inside*
    # each group so the T.C weighting never leaks across groups.
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

    # If a group has weight 0 (e.g. every remaining stall is Out-of-Order)
    # push the entire group-probability mass to the other group so we
    # don't waste a scheduling attempt. Matches frontend fallback where
    # an empty group yields 0 and the other side absorbs the distribution.
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
    """
    Etiquette-only shares for free fixtures of *group_kind* (`"stall"` or
    `"urinal"`).  Fixtures with T.C==0 are pre-filtered so only viable
    candidates participate.  Shares sum to 1.0 (or empty dict when no
    viable candidate exists).
    """
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
    """
    Sequential evaluation matching the spec's "in succession" rule.

    1. Sample a fixture from the etiquette distribution.
    2. Accept with probability T.C (cleanliness).  If rejected, remove
       that fixture, re-normalise the remaining shares, and repeat.
    3. Return the accepted fixture index, or ``None`` if every candidate
       was rejected (caller decides: exit vs wait).
    """
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
    """Return a key sampled from `weights`, or None if empty."""
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
    """Convenience: build a 'everything Clean, nonexistent locked' map."""
    out: Dict[int, str] = {}
    for i, t in enumerate(toilet_types):
        out[i] = "Non-Existent" if str(t).lower() == "nonexistent" else "Clean"
    return out


def conditions_from_frontend_payload(
    toilet_types: Sequence[str],
    restroom_conditions: Dict | None,
) -> Dict[int, str]:
    """
    Convert the frontend `{stalls:[{id,condition}], urinals:[{id,condition}]}`
    shape into a 0-indexed map aligned with `toilet_types`.
    """
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
                # Non-existent fixtures stay locked regardless of payload.
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
