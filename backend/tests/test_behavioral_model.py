"""
Unit tests for the Dummy Mode behavioral model.

Focused on the policy-critical behaviours called out in the plan:
- Poo users must never be assigned to urinals.
- Pee users use `shy_peer_pct` to split between groups.
- The middle-first rule keeps working when a sibling is in-use.
- Non-existent and out-of-order fixtures are excluded.
- Two-slot layouts (Seamen Center) treat both slots as outers.
"""

from __future__ import annotations

import os
import random
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from behavioral_model import (  # noqa: E402
    compute_candidate_weights,
    compute_group_etiquette_shares,
    empty_conditions_for_types,
    pick_sequential,
)


MACLEAN = ["stall", "stall", "stall", "urinal", "urinal", "urinal"]
SEAMEN = ["stall", "stall", "nonexistent", "urinal", "urinal", "nonexistent"]


def _clean(types):
    return empty_conditions_for_types(types)


def _sum_close(weights, expected, places=6):
    total = sum(weights.values())
    return abs(total - expected) < 10 ** (-places)


class PooPolicyTests(unittest.TestCase):
    def test_poo_only_picks_stalls(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1, 2, 3, 4, 5],
            user_type="poo",
            shy_peer_pct=50.0,
            middle_pct=2.0,
        )
        self.assertTrue(_sum_close(weights, 1.0))
        self.assertTrue(set(weights.keys()).issubset({0, 1, 2}))

    def test_poo_with_all_stalls_busy_waits(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[3, 4, 5],  # urinals free, no stall
            user_type="poo",
            shy_peer_pct=50.0,
            middle_pct=2.0,
        )
        self.assertEqual(weights, {})


class MiddleRuleTests(unittest.TestCase):
    def test_all_three_stalls_respects_middle_pct(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1, 2],
            user_type="poo",
            shy_peer_pct=0.0,
            middle_pct=2.0,
        )
        # outers share (1 - 0.02), middle gets 0.02.
        self.assertAlmostEqual(weights[0], (1 - 0.02) / 2, places=6)
        self.assertAlmostEqual(weights[2], (1 - 0.02) / 2, places=6)
        self.assertAlmostEqual(weights[1], 0.02, places=6)

    def test_third_stall_busy_keeps_middle_rule_between_outer_and_middle(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1],  # middle + one outer free, other outer busy
            user_type="poo",
            shy_peer_pct=0.0,
            middle_pct=2.0,
        )
        self.assertAlmostEqual(weights[0], 0.98, places=6)
        self.assertAlmostEqual(weights[1], 0.02, places=6)

    def test_middle_busy_splits_outers_50_50(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 2],
            user_type="poo",
            shy_peer_pct=0.0,
            middle_pct=2.0,
        )
        self.assertAlmostEqual(weights[0], 0.5, places=6)
        self.assertAlmostEqual(weights[2], 0.5, places=6)

    def test_urinal_first_busy_applies_middle_rule_to_remaining(self):
        # In MacLean the first urinal is idx 3, middle is 4, last is 5.
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[4, 5],  # middle + opposite outer free
            user_type="pee",
            shy_peer_pct=0.0,  # forces urinal group only
            middle_pct=2.0,
        )
        self.assertAlmostEqual(weights[5], 0.98, places=6)
        self.assertAlmostEqual(weights[4], 0.02, places=6)


class SeamenTests(unittest.TestCase):
    def test_two_slot_layout_ignores_middle_rule(self):
        weights = compute_candidate_weights(
            toilet_types=SEAMEN,
            conditions_by_index=_clean(SEAMEN),
            free_indices=[0, 1, 3, 4],
            user_type="poo",
            shy_peer_pct=50.0,
            middle_pct=2.0,  # should NOT apply - only 2 stalls exist
        )
        self.assertAlmostEqual(weights[0], 0.5, places=6)
        self.assertAlmostEqual(weights[1], 0.5, places=6)
        self.assertNotIn(2, weights)
        self.assertNotIn(5, weights)

    def test_nonexistent_never_candidate(self):
        weights = compute_candidate_weights(
            toilet_types=SEAMEN,
            conditions_by_index=_clean(SEAMEN),
            free_indices=[0, 1, 2, 3, 4, 5],  # even if caller forgets to filter
            user_type="pee",
            shy_peer_pct=50.0,
            middle_pct=50.0,
        )
        self.assertNotIn(2, weights)
        self.assertNotIn(5, weights)


class CleanlinessTests(unittest.TestCase):
    def test_out_of_order_fixture_dropped(self):
        conds = _clean(MACLEAN)
        conds[2] = "Out-of-Order"
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=conds,
            free_indices=[0, 1, 2],
            user_type="poo",
            shy_peer_pct=0.0,
            middle_pct=2.0,
        )
        self.assertNotIn(2, weights)
        # Now only outer-0 and middle remain; the 3-slot layout rule
        # still applies to those two.
        self.assertAlmostEqual(weights[0], 0.98, places=6)
        self.assertAlmostEqual(weights[1], 0.02, places=6)

    def test_horrendous_still_a_candidate_but_downweighted(self):
        conds = _clean(MACLEAN)
        conds[0] = "Horrendous"  # T.C = 0.1
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=conds,
            free_indices=[0, 1],
            user_type="poo",
            shy_peer_pct=0.0,
            middle_pct=2.0,
        )
        self.assertIn(0, weights)
        self.assertIn(1, weights)
        self.assertLess(weights[0], 0.98)

    def test_all_candidates_zero_tc_returns_empty(self):
        conds = _clean(MACLEAN)
        for i in range(6):
            conds[i] = "Out-of-Order"
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=conds,
            free_indices=[0, 1, 2, 3, 4, 5],
            user_type="pee",
            shy_peer_pct=50.0,
            middle_pct=2.0,
        )
        self.assertEqual(weights, {})


class PeePolicyTests(unittest.TestCase):
    def test_shy_peer_split(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1, 2, 3, 4, 5],
            user_type="pee",
            shy_peer_pct=10.0,
            middle_pct=2.0,
        )
        stall_mass = sum(weights[i] for i in (0, 1, 2) if i in weights)
        urinal_mass = sum(weights[i] for i in (3, 4, 5) if i in weights)
        self.assertAlmostEqual(stall_mass, 0.10, places=6)
        self.assertAlmostEqual(urinal_mass, 0.90, places=6)

    def test_no_free_stall_but_free_urinal_pushes_full_mass_to_urinals(self):
        weights = compute_candidate_weights(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[3, 4, 5],
            user_type="pee",
            shy_peer_pct=50.0,
            middle_pct=2.0,
        )
        self.assertTrue(_sum_close(weights, 1.0))
        for i in (0, 1, 2):
            self.assertNotIn(i, weights)


class GroupEtiquetteSharesTests(unittest.TestCase):
    """Tests for compute_group_etiquette_shares (single-group etiquette)."""

    def test_stall_shares_respect_middle_rule(self):
        shares = compute_group_etiquette_shares(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1, 2],
            middle_pct=2.0,
            group_kind="stall",
        )
        self.assertAlmostEqual(shares[0], 0.49, places=6)
        self.assertAlmostEqual(shares[1], 0.02, places=6)
        self.assertAlmostEqual(shares[2], 0.49, places=6)

    def test_urinal_shares_respect_middle_rule(self):
        shares = compute_group_etiquette_shares(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[3, 4, 5],
            middle_pct=2.0,
            group_kind="urinal",
        )
        self.assertAlmostEqual(shares[3], 0.49, places=6)
        self.assertAlmostEqual(shares[4], 0.02, places=6)
        self.assertAlmostEqual(shares[5], 0.49, places=6)

    def test_ooo_fixture_excluded_from_shares(self):
        conds = _clean(MACLEAN)
        conds[0] = "Out-of-Order"
        shares = compute_group_etiquette_shares(
            toilet_types=MACLEAN,
            conditions_by_index=conds,
            free_indices=[0, 1, 2],
            middle_pct=2.0,
            group_kind="stall",
        )
        self.assertNotIn(0, shares)
        self.assertAlmostEqual(shares[2], 0.98, places=6)
        self.assertAlmostEqual(shares[1], 0.02, places=6)

    def test_empty_when_all_ooo(self):
        conds = _clean(MACLEAN)
        for i in (0, 1, 2):
            conds[i] = "Out-of-Order"
        shares = compute_group_etiquette_shares(
            toilet_types=MACLEAN,
            conditions_by_index=conds,
            free_indices=[0, 1, 2],
            middle_pct=2.0,
            group_kind="stall",
        )
        self.assertEqual(shares, {})

    def test_ignores_wrong_group(self):
        shares = compute_group_etiquette_shares(
            toilet_types=MACLEAN,
            conditions_by_index=_clean(MACLEAN),
            free_indices=[0, 1, 2, 3, 4, 5],
            middle_pct=2.0,
            group_kind="stall",
        )
        for i in (3, 4, 5):
            self.assertNotIn(i, shares)


class PickSequentialTests(unittest.TestCase):
    """Tests for sequential accept/reject cleanliness evaluation."""

    def test_all_clean_always_picks(self):
        rng = random.Random(42)
        conds = _clean(MACLEAN)
        shares = {0: 0.49, 1: 0.02, 2: 0.49}
        for _ in range(50):
            result = pick_sequential(shares, conds, rng)
            self.assertIn(result, (0, 1, 2))

    def test_single_horrendous_rejects_most(self):
        rng = random.Random(0)
        conds = _clean(MACLEAN)
        conds[1] = "Horrendous"
        shares = {1: 1.0}
        accepts = sum(
            1 for _ in range(1000)
            if pick_sequential(shares, conds, rng) is not None
        )
        self.assertGreater(accepts, 50)
        self.assertLess(accepts, 200)

    def test_all_horrendous_high_reject(self):
        rng = random.Random(7)
        conds = {0: "Horrendous", 1: "Horrendous", 2: "Horrendous"}
        shares = {0: 0.49, 1: 0.02, 2: 0.49}
        rejects = sum(
            1 for _ in range(1000)
            if pick_sequential(shares, conds, rng) is None
        )
        # Sequential: reject_prob ≈ 0.9^3 = 0.729
        self.assertGreater(rejects, 650)
        self.assertLess(rejects, 810)

    def test_mixed_clean_horrendous_never_rejects(self):
        rng = random.Random(99)
        conds = {0: "Clean", 1: "Horrendous"}
        shares = {0: 0.5, 1: 0.5}
        for _ in range(200):
            result = pick_sequential(shares, conds, rng)
            self.assertIsNotNone(result)

    def test_ooo_only_always_rejects(self):
        rng = random.Random(1)
        conds = {3: "Out-of-Order"}
        shares = {3: 1.0}
        for _ in range(50):
            self.assertIsNone(pick_sequential(shares, conds, rng))

    def test_empty_shares_returns_none(self):
        rng = random.Random(1)
        self.assertIsNone(pick_sequential({}, _clean(MACLEAN), rng))


if __name__ == "__main__":
    unittest.main()
