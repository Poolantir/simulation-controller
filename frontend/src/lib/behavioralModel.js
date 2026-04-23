/**
 * Behavioral-Model probability math.
 *
 * A user's toilet choice is modeled as a two-level probability tree:
 *
 *   Level 1 — group choice:
 *     Stall group:  P(S.P)      (shy pee-er routes to stalls)
 *     Urinal group: 1 - P(S.P)
 *
 *   Level 2 — within-group share, weighted by per-toilet cleanliness T.C:
 *     3-toilet group:  ends (1 - P(M.T.A.F.C))/2 · T.C, middle P(M.T.A.F.C) · T.C
 *     2-toilet group:  50% · T.C each
 *     1-toilet group:  100% · T.C
 *
 * Leaf probabilities are normalized **within each group** so the group's
 * leaves sum to the group's level-1 probability whenever at least one
 * toilet in that group has T.C > 0. When a group has no usable toilet,
 * its leaves are all 0 (no cross-group redistribution here — that is
 * handled at the scheduler layer, out of scope for this visual).
 *
 * For poo users (Case 2): groupProb_stall = 1, groupProb_urinal = 0.
 */

const T_C_BY_CONDITION = {
  Clean: 1.0,
  Fair: 0.75,
  Dirty: 0.5,
  Horrendous: 0.1,
  "In-Use": 0,
  "Out-of-Order": 0,
  "Currently Being Cleaned": 0,
  "Non-Existent": 0,
};

export function toiletCleanlinessWeight(condition) {
  if (condition == null) return 1;
  return T_C_BY_CONDITION[condition] ?? 1;
}

/** Raw within-group share (before T.C weighting). Mirrors scheduler spec. */
export function shareForGroup(count, middlePct) {
  const m = Math.min(100, Math.max(0, middlePct)) / 100;
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [0.5, 0.5];
  if (count === 3) {
    const side = (1 - m) / 2;
    return [side, m, side];
  }
  return Array.from({ length: count }, () => 1 / count);
}

/** Symbolic label for a within-group share, optionally multiplied by T.C. */
function shareLabel(count, positionInGroup, showTC) {
  const tc = showTC ? " · {T.C}" : "";
  if (count <= 0) return "";
  if (count === 1) return `{1}${tc}`;
  if (count === 2) return `{1/2}${tc}`;
  if (count === 3) {
    if (positionInGroup === 1) return `{P(M.T.A.F.C)}${tc}`;
    return `{(1 − P(M.T.A.F.C))/2}${tc}`;
  }
  return `{1/${count}}${tc}`;
}

/**
 * Build a behavioral-model tree for rendering.
 *
 * @param {object} params
 * @param {{toiletTypes:string[], shyPeerPct:number, middleToiletFirstChoicePct:number}} params.config
 * @param {{stalls:{id:number,condition:string}[], urinals:{id:number,condition:string}[]}} [params.restroomConditions]
 * @param {"pee"|"poo"} [params.userType="pee"]
 * @param {boolean} [params.allClean=false] — Case 1/2 visuals force T.C=1 everywhere.
 * @param {boolean} [params.showToiletClassification=true] — include "· {T.C}" in labels.
 */
export function computeBehavioralTree({
  config,
  restroomConditions,
  userType = "pee",
  allClean = false,
  showToiletClassification = true,
}) {
  const toiletTypes = config.toiletTypes.map((t) => String(t).toLowerCase());
  const stallIdx = toiletTypes
    .map((t, i) => (t === "stall" ? i : -1))
    .filter((i) => i >= 0);
  const urinalIdx = toiletTypes
    .map((t, i) => (t === "urinal" ? i : -1))
    .filter((i) => i >= 0);

  const conditionFor = (globalIdx) => {
    if (allClean) return "Clean";
    if (!restroomConditions) return "Clean";
    const type = toiletTypes[globalIdx];
    const pool =
      type === "stall" ? restroomConditions.stalls : restroomConditions.urinals;
    const entry = pool?.find(
      (x) => x.id === globalIdx + 1 || x.id === String(globalIdx + 1)
    );
    return entry?.condition ?? "Clean";
  };

  const shy = Math.min(100, Math.max(0, config.shyPeerPct)) / 100;

  let groupProbStall;
  let groupProbUrinal;
  if (userType === "poo") {
    groupProbStall = stallIdx.length > 0 ? 1 : 0;
    groupProbUrinal = 0;
  } else {
    if (stallIdx.length === 0) {
      groupProbStall = 0;
      groupProbUrinal = urinalIdx.length > 0 ? 1 : 0;
    } else if (urinalIdx.length === 0) {
      groupProbStall = 1;
      groupProbUrinal = 0;
    } else {
      groupProbStall = shy;
      groupProbUrinal = 1 - shy;
    }
  }

  const stallShares = shareForGroup(
    stallIdx.length,
    config.middleToiletFirstChoicePct
  );
  const urinalShares = shareForGroup(
    urinalIdx.length,
    config.middleToiletFirstChoicePct
  );

  const stallTC = stallIdx.map((i) => toiletCleanlinessWeight(conditionFor(i)));
  const urinalTC = urinalIdx.map((i) =>
    toiletCleanlinessWeight(conditionFor(i))
  );

  const stallWeights = stallShares.map((s, j) => s * stallTC[j]);
  const urinalWeights = urinalShares.map((s, j) => s * urinalTC[j]);
  const stallSum = stallWeights.reduce((a, b) => a + b, 0);
  const urinalSum = urinalWeights.reduce((a, b) => a + b, 0);

  const leafPercents = new Array(toiletTypes.length).fill(0);
  stallIdx.forEach((idx, j) => {
    leafPercents[idx] =
      stallSum > 0 ? (groupProbStall * stallWeights[j] * 100) / stallSum : 0;
  });
  urinalIdx.forEach((idx, j) => {
    leafPercents[idx] =
      urinalSum > 0
        ? (groupProbUrinal * urinalWeights[j] * 100) / urinalSum
        : 0;
  });

  const level1Labels =
    userType === "poo"
      ? ["{100%}", "{0%}"]
      : stallIdx.length === 0 || urinalIdx.length === 0
      ? ["{100%}", "{0%}"]
      : ["{P(S.P)}", "{1 − P(S.P)}"];

  const level2StallLabels = stallShares.map((_, j) =>
    shareLabel(stallIdx.length, j, showToiletClassification)
  );
  const level2UrinalLabels = urinalShares.map((_, j) =>
    shareLabel(urinalIdx.length, j, showToiletClassification)
  );

  return {
    toiletTypes,
    stallIdx,
    urinalIdx,
    groupProbs: { stall: groupProbStall, urinal: groupProbUrinal },
    leafPercents,
    labels: {
      level1: level1Labels,
      stall: level2StallLabels,
      urinal: level2UrinalLabels,
    },
  };
}

export function formatModelPercent(value) {
  if (value <= 0) return "0%";
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${s}%`;
}
